# V3 Navbar Refresh Design

## Goal

Bring the public product navigation in line with the supplied V3 prototype while preserving the production shell, routes, assistant entry, and accessibility behavior.

## Design

- Keep the existing production wordmark, AI assistant entry, contact link, trial action, responsive drawer, keyboard controls, and real Next.js routes.
- Preserve the existing frosted-glass header: a translucent light surface, blur, saturation, border, and solid reduced-transparency fallback. It must not become fully transparent.
- Match the V3 product menu hierarchy: keep the trigger label `产品` and `/product` route, render an intro titled `元启 AI 开发赋能平台` with `进入产品中心 →`, arrange six full-stack platform modules as a 3-by-2 desktop field, and place Mario plus AIPPT/AISHREK in a narrow right rail. Existing child routes remain unchanged; prototype `data-page` values are not routes.
- Reuse the same optional intro and overview copy in the mobile product accordion so desktop and mobile navigation stay semantically aligned.
- Keep the other public mega menus on the shared renderer; no new menu component or duplicated navigation data.

## Verification

- Component tests prove the V3 title, overview wording, grouping, unchanged routes, mobile copy, and assistant entry.
- `packages/ui/src/app-shell.test.tsx` and `packages/ui/src/navigation/mega-menu.test.tsx` provide the CSS contracts for the product layout and non-transparent frosted-glass header.
- The affected Web and Database CI failures are reproduced and corrected without changing production behavior.
- Browser verification checks `/downloads` at 1440×900 and 390×844: desktop product-menu hierarchy and glass header, mobile product accordion copy, assistant entry, and real `/product` links.
