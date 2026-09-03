# Armario de pinturas

Inventario rápido para miniaturas: colores con equivalencias entre **Two Thin Coats**, **Citadel**, **Vallejo** y **AK 3rd Gen**. Marcas lo que ya tienes; se sincroniza en Supabase.

## Cómo usarlo

1. Pulsa el círculo del color o el chip **Me falta / Lo tengo** para marcar que ya cubres ese tono.
2. Pulsa el equivalente concreto (Citadel, Vallejo, AK, TTC) si quieres anotar *qué bote* tienes.
3. Filtra por **Me faltan** cuando vayas a comprar.
4. Organiza por **paletas**; el inventario es compartido entre ellas.

## Copiar / Pegar

Tabla markdown (opcionalmente con el nombre de la paleta arriba):

```
Pallid Hands
| Uso | TTC | Citadel | Vallejo | AK |
| --- | --- | --- | --- | --- |
| Bronce | **Spartan Bronze** | Balthasar Gold | Bright Bronze | Bronze |
| Metal | **Sir Coates Silver** | Leadbelcher | Gunmetal | Gun Metal |
```

- `—` = sin equivalente
- `**negrita**` = el bote que tienes en esa marca

## Desarrollo local

Copia `.env.example` a `.env.local` y rellena URL + publishable key del proyecto Supabase.

```bash
npm install
npm run dev
```

La app queda en [http://127.0.0.1:43147](http://127.0.0.1:43147).

## GitHub Pages

`https://konzz.github.io/paint-dex/`
