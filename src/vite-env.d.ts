/// <reference types="vite/client" />

declare module "*.css?raw" {
  const css: string
  export default css
}
