---
description: Validates HTML/CSS changes to ensure robust responsive design and prevent overflow issues.
---

# Frontend Responsive Check

This skill ensures that frontend code (HTML/CSS/JS) adheres to responsive design best practices, preventing UI elements from overflowing or "sticking out beyond frames".

When invoked, perform a thorough review of the target frontend files (e.g., `index.html`) using the following checklist:

## 1. Overflow Prevention
- **Text Wrapping:** Ensure containers that display user-generated or dynamic text use `overflow-wrap: break-word;` or `word-wrap: break-word;` to prevent long words from breaking the layout.
- **Horizontal Overflow:** Verify that `overflow-x: hidden;` is used judiciously on body/main wrappers if needed, but primarily ensure no child element exceeds `100vw` or its container's `100%` width.
- **Box Sizing:** Ensure `box-sizing: border-box;` is applied to avoid padding/borders expanding element dimensions unexpectedly.

## 2. Flexible Layouts (Flexbox & Grid)
- **Flex Wrap:** Check flex containers (`display: flex`). If they contain multiple elements that might exceed the screen width, they must use `flex-wrap: wrap;` or handle `flex-shrink`.
- **Min/Max Constraints:** Prefer `max-width: [value]` and `width: 100%` over fixed `width: [value]`. Provide `min-width: 0;` on flex children that contain truncating text.

## 3. Media Queries & Breakpoints
- **Breakpoint Coverage:** Ensure standard breakpoints are covered (e.g., `1024px` for tablet landscape, `768px` for tablet portrait/mobile).
- **Stacking Behavior:** Check that sidebars, navigation panels, and multi-column grids correctly stack into single columns (e.g., `grid-template-columns: 1fr;` or `flex-direction: column;`) on smaller viewports.
- **Hidden Elements:** Verify that non-essential UI elements (like sidebars or complex activity panels) are appropriately hidden or converted into off-canvas menus/modals on mobile.

## 4. Modal and Absolute Positioning
- **Modals:** Ensure modals have a `max-width` (e.g., `90%`), a `max-height` (e.g., `90vh`), and use `overflow-y: auto;` to handle tall content on small screens.
- **Centering:** Modals/Fixed elements should remain centered and accessible even when the viewport is extremely small.

## Workflow Execution
1. Identify the files containing frontend layout logic.
2. Read the CSS and structure.
3. Compare the existing styles against the rules above.
4. Report any violations and use tools to implement fixes directly.