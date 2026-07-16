# Home illustration assets

Generated on **2026-07-15** with the built-in Codex image-generation tool for the homepage reference-fidelity redesign.

These are decorative section illustrations. Consumers must render them with `alt=""` and `aria-hidden="true"`; they must not add duplicate accessible names to the surrounding content.

## Output mapping

| Illustration       | Transparent source PNG          | Runtime WebP              | Intended use             |
| ------------------ | ------------------------------- | ------------------------- | ------------------------ |
| Platform loop      | `source/platform-loop.png`      | `platform-loop.webp`      | Platform overview panel  |
| Solutions platform | `source/solutions-platform.png` | `solutions-platform.webp` | Industry-solutions panel |
| Resources folder   | `source/resources-folder.png`   | `resources-folder.webp`   | Resources panel          |

## Generation prompts

All three assets used the `stylized-concept` use case, a centered 4:3 composition with generous padding, a high-key cobalt/violet/cyan translucent-glass treatment, and a perfectly flat `#00ff00` chroma background. Prompts explicitly excluded readable text, logos, watermarks, cropping, and green in the subject.

- `platform-loop`: two interlocking translucent glass ribbons, elevated front-right three-quarter view, with frosted crystal surfaces and a luminous inner edge.
- `solutions-platform`: a low rounded glass platform with three floating analytics tiles (abstract bars, magnifier, and pie-chart forms), a few cubes, and fine light arcs.
- `resources-folder`: a translucent document folder on a layered rounded base, pale document cards with abstract line motifs, a small magnifier, and sparse cubes and connector lines.

## Processing

The generated chroma images were copied to `tmp/imagegen/home/<stem>-chroma.png` and converted with the installed imagegen helper:

```sh
python3 "${CODEX_HOME:-$HOME/.codex}/skills/.system/imagegen/scripts/remove_chroma_key.py" \
  --input tmp/imagegen/home/<stem>-chroma.png \
  --out apps/web/src/assets/home/source/<stem>.png \
  --auto-key border \
  --soft-matte \
  --transparent-threshold 12 \
  --opaque-threshold 220 \
  --despill
```

Runtime assets were encoded from the transparent PNG sources with:

```sh
cwebp -q 88 -m 6 -alpha_q 95 \
  apps/web/src/assets/home/source/<stem>.png \
  -o apps/web/src/assets/home/<stem>.webp
```

## Validation

| Asset                | PNG dimensions / pixel format |  PNG size | WebP pixel format | WebP size |
| -------------------- | ----------------------------- | --------: | ----------------- | --------: |
| `platform-loop`      | 1448 x 1086 / `rgba`          | 898,207 B | `yuva420p`        |  67,336 B |
| `solutions-platform` | 1448 x 1086 / `rgba`          | 787,254 B | `yuva420p`        |  83,692 B |
| `resources-folder`   | 1448 x 1086 / `rgba`          | 847,125 B | `yuva420p`        |  91,902 B |

`ffprobe` confirmed every PNG exceeds 1024 x 768 and every PNG/WebP has alpha. All four PNG corners are fully transparent. A Pillow pixel scan found zero visible green-dominant pixels and zero green-dominant partially transparent edge pixels. Each runtime WebP is smaller than its PNG source.
