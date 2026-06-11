export type WidgetType = 'label' | 'input' | 'button' | 'table'

/** 网格坐标：列 col、行 row、宽 w、高 h（单位：网格格子数） */
export interface GridPos {
  col: number   // 1-based，起始列
  row: number   // 1-based，起始行
  w: number     // 占用列数
  h: number     // 占用行数
}

export interface WidgetStyle {
  fontSize?: number
  fontWeight?: 'normal' | 'bold'
  color?: string
  background?: string
  borderRadius?: number
  textAlign?: 'left' | 'center' | 'right'
}

/** Label */
export interface LabelProps {
  text: string
}

/** Input */
export interface InputProps {
  placeholder?: string
  varName: string
}

/** Button */
export interface ButtonProps {
  label: string
  onClick: string
}

/** Table */
export interface TableProps {
  dataVar: string
  columns: Array<{ key: string; title: string }>
}

export type WidgetProps = LabelProps | InputProps | ButtonProps | TableProps

export interface Widget {
  id: string
  type: WidgetType
  pos: GridPos
  style: WidgetStyle
  props: WidgetProps
}

export interface LowCodePage {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  cols: number
  initScript: string
  widgets: Widget[]
}

/** 运行时上下文，由 LowCodeRenderer 注入每个 widget */
export interface RuntimeContext {
  vars: Record<string, unknown>
  setVar: (key: string, val: unknown) => void
  runScript: (code: string) => Promise<void>
}
