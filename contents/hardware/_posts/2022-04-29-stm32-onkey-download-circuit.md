---
title: stm32 usb 一键下载电路
mermaid: true
---

最近购买的 stm32 开发板上有一个一键下载电路，可以不用短接 BOOT0 可以使用软件控制完成 stm32 固件下载。
于是便研究来一下这个电路的原理。

依据[AN2606](https://www.st.com/resource/en/application_note/cd00167594-stm32-microcontroller-system-memory-boot-mode-stmicroelectronics.pdf))
所述，stm32 器件可以使用串行端口使用预定义的协议下载代码。

根据不同的 stm32 可以使用不同的串行外设：

- USART,[AN3155](https://www.st.com/resource/en/application_note/cd00264342-usart-protocol-used-in-the-stm32-bootloader-stmicroelectronics.pdf)
- CAN,[AN3154](https://www.st.com/resource/en/application_note/an3154-can-protocol-used-in-the-stm32-bootloader-stmicroelectronics.pdf)
- I2C,[AN4221](https://www.st.com/resource/en/application_note/an4221-i2c-protocol-used-in-the-stm32-bootloader-stmicroelectronics.pdf)
- USB,[AN3156](https://www.st.com/resource/en/application_note/cd00264379-usb-dfu-protocol-used-in-the-stm32-bootloader-stmicroelectronics.pdf)

## 自举模式简述

由于使用的是 stm32f103c8t6,属于 stm32f10xxx 系列仅支持使用 `USART1` 外设，可以参考 AN2606 STM32F10xxx 系列设备配置需求进行配置。

stm32f103xxx 开发板端硬件配置：

- 在复位期间使 BOOT0 引脚保持高电平，使 BOOT1 引脚保持低电平。
- 将串行接口直接连接到 USART1_RX (PA10) 和 USART1_TX (PA9) 引脚。

自举程序逻辑图:

```mermaid
flowchart TB
    reset([系统复位])
    init(系统初始化 时钟,GPIO,IWDG,SysTick)
    wait{usart1 接受到 0X7F}
    disable_ir(禁用所有中断)
    config_usart1(配置usart1)
    bl_loop(执行 BL_LOOP)

    reset-->init
    init-->wait
    wait--No-->wait
    wait--Yes-->disable_ir
    disable_ir-->config_usart1
    config_usart1-->bl_loop
```

简单来说就是：

- 在上电前短接 BOOT1 和 VCC，以保持 BOOT0 高电平。
- 使用 usb 连接到开发板。一般开发板会使用 cp2102 pl2303 或者 ch340 等串口转 usb 芯片来将 usart1 转换为 usb 协议。
- 上电后 stm32 以自举模式启动。自举模式会初始化自己需要的硬件配置。
- 上位机通过 usb 控制 usart 向 usart1 发送 0x7F 以示准备完成。
- 由于使用 USART 协议，需要遵循[AN3155](https://www.st.com/resource/en/application_note/cd00264342-usart-protocol-used-in-the-stm32-bootloader-stmicroelectronics.pdf) 中的协议进行交互。
- 通信完成后，可以通过硬件复位退出自举模式。（由于硬件复位会清除 sram 中的数据，一般会在完成后使用 协议中的 go 命令从合适的位置继续执行，而避免硬件复位）

## 电路及其原理

根据自举模式硬件模式要求，需要在启动时使 BOOT0 引脚保持高电平，使 BOOT1 引脚保持低电平。
这一步骤需要手动操作,如果能够将这一步通过软件进行控制,就可以能够做到完全一键下载.

许多开发板都有一键下载电路，核心电路图大概是这样：

![onekey-dl-circuit](/assets/img/stm32-onekey-dl-circuit.png)

核心思路：

- 假设开发板以正常模式运行并通过 usb 连接至上位机，RTS# 和 DTR# 初始状态时为高电平
- 使 RTS# 为低电平，此时 Q1 Q2 导通 NRST 为低电平,BOOT0 为高电平，MCU 处于复位状态
- 延时 100 ms，等待复位完成
- 使 DTR# 为低电平 Q1 断开，NRET 为高电平，MCU 启动。
- 由于此时 BOOT0 为高电平,BOOT1 为低电平。复位后，在 SYSCLK 的第四个上升沿锁存 BOOT 引脚的值。此时 stm32 启动进入系统存储器自举模式
- 上位机控制 usart1 发送 0x7F 开始自举协议。协议细节参考 AN3155
- 通过自举协议下载程序至 sram 或其他位置，完成后使用协议中 go 命令从 sram 继续执行

那么需要如何操作才能使 RTS# 和 DTR# 为低电平呢?

需要了解 [rs232](https://en.wikipedia.org/wiki/RS-232) 协议,在协议中仅 TxD,DTR,RTS pin 可以为输出模式，
由于 uart 仅使用 TxD，RxD 就可以完成数据收发，DTR,RTS 闲置因此可以用作自定义用途。

以及 linux 串口启动程序实现中关于何如控制串口设备:

**此处缺失资料...**

可以简单理解为：

- 上位机设置 RTS 为高电平时，RTS# 为低电平，反之为高电平
- 上位机设置 DTR 为高电平时，DTR# 为低电平，反之为高电平

## 工具

知道原理后，可以选择合适的工具来帮我们完成上述工作，而无需自己编写上位机程序。

可选工具：

- [STM32CubeProgrammer](https://www.stmicroelectronics.com.cn/en/development-tools/stm32cubeprog.html)，st 官方工具，功能非常全面。
- [stm32flash](https://sourceforge.net/projects/stm32flash)，开源软件，专门针对 stm32 设计，支持自定义 usart 控制，支持一键下载电路。
- [dfu-util](http://dfu-util.sourceforge.net)，dfu 协议工具，支持使用 usb 外设的 stm32 系列，遗憾的是 stm32f103c8t6 并不支持 usb 方式。

最终选择 stm32flash ，因为在 linux 和 macos 下获取非常方便且开源,方便了解更多实现细节。

> windows 系统下可以选择 mcuisp 或者叫 fly mcu 的软件进行下载，简单方便。
> 但使用这种工具并不方便我们了解实现原理，而且也不知道这些软件是否“安全”。

使用方式：

```sh
sudo stm32flash -i '-dtr,dtr:-dtr,dtr&-rts'   /dev/cu.usbserial-10
```
