---
title: typescript 装饰器 之 元数据与反射使用
---

typescript 提供了装饰器，能够达成类似于 Jva Annotations 的效果，某些时候可以给开发带来便利。

## 参考文档

[decorators](https://www.typescriptlang.org/docs/handbook/decorators.html)

## React 示例

这里的应用场景是：

- 使用 typescript
- 使用 ant design 组件 Table ，Table 必须接受 两个 prop columns 和 dataSource 才能成功渲染出一个表格

对于多数情况，不仅需要定义 datasource 的结构，还需要定义 columns 。 有没有更炫酷的办法呢？

于是有了以下的[示例](#示例)

组件 VariableTable 扩展了 antd Table ，实现自动从 dataSource 中解析出需要的 Title Key Hidden 等信息，来自动生成 columns 字段。

开发者只需要关心 datasource 的类定义就可以了。一定程度的减少了 hard code。

```typescript jsx
// src/App.tsx
import React from "react";
import "./App.css";
import VariableTable from "./components/VariableTable";
import Row from "antd/es/grid/row";
import Col from "antd/es/grid/col";
import moment from "moment";
import "moment/locale/zh-cn";
import "antd/dist/antd.css";
import "./index.css";
import Annotations from "./global/Annotations";

moment.locale("zh-cn");

class CustomStruct {
  @Annotations.Key()
  @Annotations.Title("编号")
  id: number;

  @Annotations.Key()
  @Annotations.Title("姓名")
  name: string;

  @Annotations.Hidden()
  @Annotations.Title("年龄")
  age: number;

  constructor(object: { id: number; name: string; age: number }) {
    this.id = object.id;
    this.name = object.name;
    this.age = object.age;
  }
}

const App: React.FC = () => {
  /*
    数据源，这里一般来源于 API response，
    你需要解决的是使用定义的格式去解析 response data
  */
  let dataSource = [
    { id: 0, name: "teacher", age: 23 },
    { id: 1, name: "student", age: 16 },
  ];

  let dataStruct = new Array<CustomStruct>();
  dataSource.forEach((value) => {
    return dataStruct.push(new CustomStruct(value));
  });

  return (
    <Row>
      <Col>
        <VariableTable dataSource={dataStruct} />
      </Col>
    </Row>
  );
};

export default App;
```

```typescript jsx
// src/components/VariableTable.tsx
import * as React from "react";
import { Table } from "antd";
import { TableProps, TableState } from "antd/es/table";
import "reflect-metadata";
import { ColumnProps } from "antd/es/table/interface";
import Annotations from "../global/Annotations";

/*
 *
 * 基于 ant design Table 组件扩展新功能,你可以像原生 ant design table 组件一样使用。
 *   1. 引入ts 反射和注解，
 *     支持使用注解 @Annotations.Title("<name>") 来生成 Table Columns prop，
 *     支持使用注解 @Annotations.Key() 来定生成 Table RowKey prop
 *   2. 以上功能仅在 没有相应的字段被定义的时候生效，可以使用自定义的prop覆盖
 *     例如：在使用本组件时 <VariableTable RowKey="id"/> ，则不会自动生成 rowKey，同理 Columns。
 *
 *  @date 2019年5月16日（星期四） (GMT+8) 13:20
 *
 * */
export default class VariableTable<T> extends React.Component<
  TableProps<T>,
  TableState<T>
> {
  static propTypes: {};
  static defaultProps: {};

  parseRowKey = (record: T): string => {
    let rowKeys = "";
    Reflect.ownKeys(record as unknown as object).forEach((key) => {
      if (Reflect.hasMetadata(Annotations.MetaKey, record, key.toString())) {
        rowKeys +=
          Reflect.get(record as unknown as object, key.toString()) + ",";
      }
    });
    return rowKeys;
  };

  parseColumns = (
    items: Array<T> | undefined
  ): Array<ColumnProps<T>> | undefined => {
    if (items === undefined) return undefined;
    let item = items[0];
    let columns = Array<ColumnProps<T>>();
    Reflect.ownKeys(item as unknown as object).forEach((key) => {
      if (!Reflect.hasMetadata(Annotations.MetaHidden, item, key.toString())) {
        columns.push({
          title: Reflect.getMetadata(
            Annotations.MetaTitle,
            item,
            key.toString()
          ),
          dataIndex: key.toString(),
          key: key.toString(),
        });
      }
    });
    return columns;
  };

  render(): React.ReactElement<React.JSXElementConstructor<Table<T>>> {
    const properties = { ...this.props };
    if (properties.columns === undefined) {
      properties.columns = this.parseColumns(properties.dataSource);
    }
    if (properties.rowKey === undefined) {
      properties.rowKey = this.parseRowKey;
    }
    return <Table {...properties} />;
  }
}
```

```typescript
// src/global/Annotations.ts
/*
* 为了使用ts的这个特性，你需要设置 `tsconfig.json` 增加
{
  "compilerOptions": {
    "target": "es5",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
* 为了使用反射元数据还需要增加依赖包：`reflect-metadata`
*
*
* 自定义注解包，你可以在class的属性上使用 例：
*
class CustomStruct {

  @Annotations.Key()
  @Annotations.Title("编号")
  id:number;

  @Annotations.Key()
  @Annotations.Title("姓名")
  name: string;

  @Annotations.Hidden()
  @Annotations.Title("年龄")
  age: number;

  constructor(id:number,name: string, age: number) {
    this.id = id;
    this.name = name;
    this.age = age;
  }
}
* */
export default class Annotations {
  static MetaTitle = "filed";
  static MetaKey = "key";
  static MetaHidden = "hidden";

  /* @param 标题 */
  static Title = (value: string) =>
    Reflect.metadata(Annotations.MetaTitle, value);

  /* 作为主键索引 */
  static Key = () => Reflect.metadata(Annotations.MetaKey, true);

  /* 隐藏 */
  static Hidden = () => Reflect.metadata(Annotations.MetaHidden, true);
}
```

tsconfig.json

```json
{
  "compilerOptions": {
    "target": "es5",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "esnext",
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "preserve",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  },
  "include": ["src"]
}
```
