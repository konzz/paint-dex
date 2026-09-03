# Armario de pinturas

Inventario rápido para miniaturas: colores con equivalencias entre **Two Thin Coats**, **Citadel**, **Vallejo** y **AK 3rd Gen**. Marcas lo que ya tienes; se sincroniza en Supabase.

## Cómo usarlo

1. Pulsa el círculo del color o el chip **Me falta / Lo tengo** para marcar que ya cubres ese tono.
2. Pulsa el equivalente concreto (Citadel, Vallejo, AK, TTC) si quieres anotar *qué bote* tienes.
3. Filtra por **Me faltan** cuando vayas a comprar.
4. Organiza por **paletas** (ej. Pallid Hands); el inventario es compartido entre ellas.

## Copiar / Pegar

Texto plano (no JSON):

```
Nombre de la paleta
Color: Two Thin Coats, Citadel, Vallejo, AK
Otro color: -, Citadel Name, Vallejo Name, -
```

Usa `-` si no hay equivalente. La primera línea es el nombre; si la paleta ya existe, se actualiza.

## Desarrollo local

Copia `.env.example` a `.env.local` y rellena URL + publishable key del proyecto Supabase.

```bash
npm install
npm run dev
```

La app queda en [http://127.0.0.1:43147](http://127.0.0.1:43147).

```bash
npm run build
npm run preview
```

## GitHub Pages

Al hacer push a `main`, el workflow `.github/workflows/deploy-pages.yml` publica `dist/`.

`https://konzz.github.io/paint-dex/`
