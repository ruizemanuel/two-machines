# Dos máquinas

La miniatura de esta página la dibuja un ordenador sin tarjeta gráfica.

No hay ningún PNG en el repo. La moneda que ves es una fórmula — tres pases WGSL sobre `vgpu` — y esa misma fórmula corre en dos sitios: en tu navegador, con tu GPU, cuando pulsás "Acuñar"; y en el servidor, sin GPU, cuando ese acuñado dispara `/api/mint` para generar la tarjeta de previsualización que verá quien reciba el link. El punto de la pieza es que las dos se corresponden — con el matiz de la sección siguiente.

## La frase permitida sobre el renderer

Esta pieza nunca dice "determinístico" a secas, porque no lo es entre GPUs distintas. La frase permitida es:

> **"bit-identical on the pinned CPU renderer"**

Medido en el Spike 0: cuatro llamadas seguidas al servidor dan el mismo sha256 — **0 píxeles distintos**. El mismo shader, corrido en local sobre una D3D12 real y comparado contra el servidor con `llvmpipe`, da **6.667 píxeles distintos de 756.000 (0,88 %)**. Esa diferencia es real y es de esperar: cada GPU redondea distinto. Por eso el servidor no usa "tu tarjeta gráfica, la que sea" — usa siempre el mismo renderer software fijado (Mesa 25.0.7), y las imágenes doradas de los tests solo se comparan contra ese renderer, nunca contra una GPU real.

## Cómo correr en local

```bash
npm install
npm run dev
```

Abre `http://localhost:3000`. El canvas usa tu GPU real vía WebGPU; si el navegador no lo soporta, la página degrada al PNG que devuelve el servidor a sangre, con el titular encima — nunca a un `Error:` en pantalla.

`npm run dev` dispara antes el script `predev`, que compila `dist/render-child.mjs` con esbuild. Ese hijo es el que renderiza en el servidor y `dist/` no está en el repo, así que sin ese paso `/api/mint` respondería 500 en un clon recién hecho. Si hace falta compilarlo suelto — por ejemplo para correr sólo la ruta — es `npm run build:child`.

`/api/mint` en local también renderiza sin GPU — usa el mismo camino de proceso hijo que producción — pero necesita el renderer software instalado primero:

```bash
npx vgpu install-software-renderer
npx vgpu doctor
```

Esto **no funciona en Windows ni en macOS**: el renderer software de vgpu solo existe en Linux (`VGPU-NODE-SOFTWARE-RENDERER-UNSUPPORTED`). En un checkout de Windows, `npm run dev` sirve la página y el canvas del navegador funciona con normalidad, pero `/api/mint` no tiene adaptador y la tarjeta de previsualización no aparece. Para probar ese camino hace falta Linux, WSL o Docker.

### Tests

```bash
npm test
```

Corre toda la suite con Vitest. Los tests puros (estado, número de serie, encoder PNG, la fuente bitmap) corren en cualquier sistema. Las suites que necesitan GPU (`describe.skipIf(!SOFTWARE)`) se saltan fuera de Linux — en Windows la suite completa da **PASS con tests saltados, cero `failed`**; un solo `failed` sí es una regresión real, un `skipped` en Windows no lo es.

Los tests de presupuesto (`test/budgets.test.ts`) que miden el bundle del cliente se saltan si no existe `.next` — hace falta compilar antes:

```bash
npx next build
npm test
```

`test/contract.test.ts` es el único test end-to-end contra un despliegue real; no corre a menos que se le dé una URL (ver "Desplegar", abajo).

## Por qué existe `scripts/prepare-vulkan.mjs`

El runtime de Vercel (Amazon Linux 2023) no trae el *loader* de Vulkan ni las librerías que necesita `lavapipe`, el renderer software que usa el servidor. Sin este script, un despliegue nuevo arranca, recibe una petición a `/api/mint`, y falla: no hay adaptador GPU, ni real ni software, en la imagen del runtime.

`scripts/prepare-vulkan.mjs` corre como paso de build (`npm run vercel-build`) y:

1. Instala `vgpu install-software-renderer` en `.vgpu-cache`.
2. Instala con `dnf` el *loader* exacto que validó el Spike 0 — `vulkan-loader-1.3.296.0-72.amzn2023.0.1` — junto con `libdrm`, `zlib`, `libzstd` y `systemd-libs`.
3. Copia al bundle el `libvulkan.so.1` y las dependencias de `lavapipe` que la imagen del runtime no trae ya puestas.
4. Corre `vgpu doctor` contra ese bundle y **falla el build** si el veredicto no es `healthy` o si el adaptador no contiene `Mesa 25.0.7` — la versión exacta que valida cada imagen dorada. Un build verde con la versión equivocada de Mesa sería peor que uno rojo: dejaría desplegado un servidor cuyos píxeles ya no coinciden con lo que los tests dicen que produce.

Sin este paso, clonar el repo y desplegar sin pasos manuales — el criterio de aceptación de esta tarea — no es posible: `/api/mint` respondería 500 en cada llamada.

## Cómo se generan las imágenes doradas

Ninguna imagen dorada puede generarse en la máquina de desarrollo: el renderer software de vgpu no existe en Windows ni en macOS, y `init()` en modo `auto` coge la GPU real — un dorado "generado" ahí llevaría píxeles de D3D12 con nombre de Mesa, exactamente el error que el guardia de `test/helpers/golden.ts` existe para impedir.

El único camino es el job manual `bootstrap-goldens` en `.github/workflows/ci.yml`:

1. Lanzar el workflow a mano (`workflow_dispatch`) desde GitHub Actions.
2. El job corre la suite completa con `UPDATE_GOLDEN=1` sobre Linux, con el renderer fijado, y sube los PNG resultantes como artefacto — no los commitea.
3. Descargar el artefacto y **mirar cada imagen** — cada tarea del plan dice exactamente qué debe verse en la suya.
4. Commitear a mano los PNG en `test/golden/`, con el nombre que ya lleva la versión de Mesa dentro (`coin-frozen@mesa-25.0.7.png`). Si vgpu cambia de Mesa o Vercel cambia la imagen base, el test de golden falla por fichero ausente en vez de por diferencia de píxeles — un fallo mucho más fácil de diagnosticar.

A partir de ahí, el job `test` de CI los compara con tolerancia cero en cada push.

## Presupuestos

El objetivo del §12 del spec es 60 KB gzip de JavaScript, vgpu incluido. Medido tras `npx next build`, con los chunks bajo `.next/static/chunks`:

| | gzip |
|---|---|
| **La pieza** (vgpu + `lib/coin/scene.ts` + la página) | **51,8 KB** |
| React + el runtime de Next | ~156 KB |
| **Total de JavaScript que descarga el visitante** | **221,2 KB** |

El presupuesto de 60 KB siempre fue sobre lo que esta pieza controla — vgpu, la escena y la página — y ahí se cumple con margen. El framework no entra en ese número porque ningún cuidado aquí lo reduciría: se reporta, no se le pone tope. Ambas cifras se publican para no esconder ninguna.

Ese 51,8 KB no salió gratis. `lib/coin/scene.ts`, que corre en el navegador, importaba `serialToWords` desde `lib/coin/serial.ts` — y `serial.ts` importa `node:crypto` para el hash del número de serie. Como `components/CoinCanvas.tsx` es un componente cliente que llega hasta `scene.ts`, Turbopack empaquetaba el `crypto` y el `Buffer` de Node enteros para el navegador — sha256, md5, ripemd, base64 — por cuatro líneas de `parseInt`. Separar esa función en `lib/coin/words.ts`, sin ninguna dependencia de Node, bajó el total de 348,9 KB a 221,2 KB: **127,7 KB** por partir un fichero en dos.

Esas cifras son **221,2 KB de JavaScript**: no incluyen ni el chunk de CSS que sirve Next ni las dos fuentes web de la sección siguiente.

### Cuánto tarda acuñar

| | medido en producción |
|---|---|
| Acuñar un estado que nadie pidió antes | **7,7 s** en caliente, 10,5 s en frío |
| Volver a pedir un estado ya acuñado | **0,32 s**, `X-Vercel-Cache: HIT` |

El spec pedía 1,5 s, medidos en el Spike 0 sobre una escena trivial. Esta no lo es, y el número se
renegoció hasta donde está la medición. Vale la pena saber por qué no baja: **no depende del tamaño**
—7,7 s a 1200×630 contra 8,6 s a 1600×900—, así que no son los píxeles, es el coste fijo de cada
petición: arrancar el proceso hijo, inicializar Dawn y compilar los shaders. Renderizar más pequeño no
lo arregla. Abaratar el raymarch sí, a cambio de cambiar el aspecto de la moneda y tener que volver a
generar las imágenes doradas.

Esos segundos los paga quien acuña algo nuevo, con el indicador `servidor · renderizando…` puesto ahí
justo para eso. Quien recibe el link no los paga: ese estado ya existe y lo sirve el CDN.

### Assets

En el repo no hay ningún PNG, WOFF ni GLB propio: `public/` está vacío y `test/budgets.test.ts` lo verifica recorriendo el directorio. La moneda — el disco, los dentículos, la leyenda `VGPU.SH` y el número de serie — sale entera de los `.wgsl`, con la fuente bitmap 5×7 empotrada como constantes `u32` en `shaders/lib/font5x7.wgsl`.

Con una excepción, y conviene decirla en vez de redondear a cero: **`app/layout.tsx` carga Geist y Geist Mono desde Google Fonts**, así que el visitante sí descarga dos fuentes web. Son las de la interfaz — el titular, los indicadores, el botón — y son la única excepción a los cero assets. **Ninguna entra en el render:** ni el canvas ni el PNG del servidor las tocan, y por eso el servidor sin GPU puede dibujar la misma moneda sin tener instalada ninguna fuente.

## Desplegar

Este repo no incluye un despliegue hecho — lo corre quien tenga la cuenta de Vercel del proyecto:

```bash
npx vercel deploy --prod
```

`vercel-build` corre `prepare-vulkan.mjs` y `build-child.mjs` antes de `next build`, así que el paso de arriba ya deja el servidor con el renderer software instalado y el hijo de render empaquetado.

Después de desplegar, verificar a mano que las dos funciones responden — la tarjeta de previsualización es la que más fácil se despliega rota, porque necesita su propia entrada en `outputFileTracingIncludes`:

```bash
curl -I "https://<tu-dominio>/api/mint?spin=0&melt=0&w=1200&h=630"
curl -I "https://<tu-dominio>/opengraph-image"
```

Las dos deben responder `200` y llevar la cabecera `x-serial`. Y para comprobar el criterio de aceptación 3 (el presupuesto de acuñado) contra el despliegue real:

```bash
MINT_URL="https://<tu-dominio>" npx vitest run test/contract.test.ts
```

Ese test está desactivado por defecto (`describe.skipIf(!MINT_URL)`) precisamente para poder correr toda la suite sin un despliegue a mano.
