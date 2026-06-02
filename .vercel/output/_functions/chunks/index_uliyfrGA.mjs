import { c as createComponent } from './astro-component_B-0_4g-R.mjs';
import { h as addAttribute, p as renderHead, k as renderTemplate } from './entrypoint__1Y7aY3S.mjs';
import { r as renderScript } from './main_BaDwT7pY.mjs';

const $$Index = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$props, $$slots);
  Astro2.self = $$Index;
  return renderTemplate`<html lang="es" data-astro-cid-j7pv25f6> <head><meta charset="utf-8"><link rel="icon" type="image/svg+xml" href="/favicon.svg"><link rel="icon" href="/favicon.ico"><meta name="viewport" content="width=device-width"><meta name="generator"${addAttribute(Astro2.generator, "content")}><title>Theme Inspector</title>${renderHead()}</head> <body data-astro-cid-j7pv25f6> <header class="no-print" data-astro-cid-j7pv25f6> <h1 data-astro-cid-j7pv25f6>Theme Inspector</h1> </header> <main data-astro-cid-j7pv25f6> <form id="analyze-form" class="no-print" data-astro-cid-j7pv25f6> <label for="url" data-astro-cid-j7pv25f6>URL</label> <input id="url" name="url" type="url" inputmode="url" placeholder="https://…" required data-astro-cid-j7pv25f6> <button id="analyze-submit" type="submit" data-astro-cid-j7pv25f6>Analizar</button> </form> <section class="how-it-works no-print" aria-labelledby="how-it-works-title" data-astro-cid-j7pv25f6> <h2 id="how-it-works-title" data-astro-cid-j7pv25f6>Cómo funciona</h2> <ol class="steps" data-astro-cid-j7pv25f6> <li class="step" data-astro-cid-j7pv25f6> <span class="stepNumber" data-astro-cid-j7pv25f6>01</span> <h3 data-astro-cid-j7pv25f6>Introduce la URL</h3> <p data-astro-cid-j7pv25f6>Pega el sitio que quieres inspeccionar y confirma el análisis.</p> </li> <li class="step" data-astro-cid-j7pv25f6> <span class="stepNumber" data-astro-cid-j7pv25f6>02</span> <h3 data-astro-cid-j7pv25f6>Extracción Inteligente</h3> <p data-astro-cid-j7pv25f6>Detectamos tipografías, colores y patrones relevantes de la UI.</p> </li> <li class="step" data-astro-cid-j7pv25f6> <span class="stepNumber" data-astro-cid-j7pv25f6>03</span> <h3 data-astro-cid-j7pv25f6>Cálculo Heurístico</h3> <p data-astro-cid-j7pv25f6>Estimamos tokens y escalas coherentes para un sistema de diseño.</p> </li> <li class="step" data-astro-cid-j7pv25f6> <span class="stepNumber" data-astro-cid-j7pv25f6>04</span> <h3 data-astro-cid-j7pv25f6>Showcase &amp; Export</h3> <p data-astro-cid-j7pv25f6>Abre un estudio visual con variables, métricas CSS y exportación a PDF.</p> </li> </ol> </section> </main> ${renderScript($$result, "C:/Users/corre/Documents/Front end/Theme Inspector/src/pages/index.astro?astro&type=script&index=0&lang.ts")} </body> </html>`;
}, "C:/Users/corre/Documents/Front end/Theme Inspector/src/pages/index.astro", void 0);

const $$file = "C:/Users/corre/Documents/Front end/Theme Inspector/src/pages/index.astro";
const $$url = "";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Index,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
