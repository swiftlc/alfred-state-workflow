export interface PlaygroundPage {
  id: string
  name: string
  html: string       // 完整自包含 HTML
  prompt: string     // 原始需求描述，用于重新生成
  createdAt: number
  updatedAt: number
}
