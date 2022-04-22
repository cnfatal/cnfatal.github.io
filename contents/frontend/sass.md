---
title: sass 使用笔记
---

本文记录了常用 sass 语法以及相关工具。

主页:[CSS with superpowers](https://sass-lang.com/)

文档:[Documentation](https://sass-lang.com/documentation)

## SASS 与 SCSS

SASS 与 SCSS 都是 sass 的语法。区别在于使一个使用缩进语法 ,而另一个使用`{` `}` `;` 来描述文档的格式。

SASS:

```sass
@mixin button-base()
  @include typography(button)
  @include ripple-surface
  @include ripple-radius-bounded

  display: inline-flex
  position: relative
  height: $button-height
  border: none
  vertical-align: middle

  &:hover
    cursor: pointer

  &:disabled
    color: $mdc-button-disabled-ink-color
    cursor: default
    pointer-events: none
```

SCSS:

```scss
@mixin button-base() {
  @include typography(button);
  @include ripple-surface;
  @include ripple-radius-bounded;

  display: inline-flex;
  position: relative;
  height: $button-height;
  border: none;
  vertical-align: middle;

  &:hover {
    cursor: pointer;
  }

  &:disabled {
    color: $mdc-button-disabled-ink-color;
    cursor: default;
    pointer-events: none;
  }
}
```

## 注释

```scss
// This comment won't be included in the CSS.
   This is also commented out.

/* But this comment will, except in compressed mode.

/* It can also contain interpolation:
   1 + 1 = #{1 + 1}

/*! This comment will be included even in compressed mode.
```

## 变量

以 `$` 开头的名称作为变量名称,格式为`$<variable>: <expression>`.

```scss
$base-color: #c6538c;
$border-dark: rgba($base-color, 0.88);

.alert {
  border: 1px solid $border-dark;
}
```
