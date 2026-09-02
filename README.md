# Armario de pinturas

Inventario rápido para miniaturas: 23 colores con equivalencias entre **Two Thin Coats**, **Citadel**, **Vallejo** y **AK 3rd Gen**. Marcas lo que ya tienes y se guarda en el navegador.

## Cómo usarlo

1. Pulsa el círculo del color o el chip **Me falta / Lo tengo** para marcar que ya cubres ese tono.
2. Pulsa el equivalente concreto (Citadel, Vallejo, AK, TTC) si quieres anotar *qué bote* tienes.
3. Filtra por **Me faltan** cuando vayas a comprar.
4. Elige la marca de la tienda en *Si voy a comprar, muéstrame* para ver los nombres de esa gama.

Los datos viven en `localStorage` de este navegador. **Exportar** descarga un JSON; **Importar** lo restaura en otro dispositivo.

## Desarrollo local

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

1. Crea el repositorio en GitHub (público, para Pages gratis).
2. En el repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Tras el primer workflow en verde, la web queda en:

`https://<usuario>.github.io/<repo>/`

El `base` de Vite es `./`, así que funciona tanto en la raíz como en un subpath de proyecto.
