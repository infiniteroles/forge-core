// Fase 6.4c — Scaffold real del MVP. Genera un proyecto Next.js + Tailwind
// mínimo pero FUNCIONAL (con Dockerfile para previsualizarlo en Coolify) a
// partir de la spec del Composer. Función PURA: solo devuelve el mapa de
// ficheros; la subida al repo la hace el stage (Contents API).

export interface ScaffoldFile {
  path: string;
  content: string;
}

export interface NextJsScaffoldInput {
  name: string;
  purpose: string;
  /** Color de acento/brand (paleta del logo o default). */
  accent?: string;
  /** Color de fondo principal. */
  background?: string;
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "app"
  );
}

/** Escapa texto para insertarlo seguro en JSX (evita romper con llaves/quotes). */
function escJsx(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\{/g, "&#123;")
    .replace(/\}/g, "&#125;");
}

export function buildNextJsScaffold(
  input: NextJsScaffoldInput
): ScaffoldFile[] {
  const name = input.name || "Mi App";
  const purpose = input.purpose || "Aplicación construida con Forge Core01.";
  const accent = input.accent || "#ff6b57";
  const background = input.background || "#0b0b0f";
  const pkg = slugify(name);
  const nameJsx = escJsx(name);
  const purposeJsx = escJsx(purpose);

  const files: ScaffoldFile[] = [];

  files.push({
    path: "package.json",
    content:
      JSON.stringify(
        {
          name: pkg,
          version: "0.1.0",
          private: true,
          scripts: {
            dev: "next dev",
            build: "next build",
            start: "next start",
            lint: "next lint",
          },
          dependencies: {
            next: "15.1.6",
            react: "^19.0.0",
            "react-dom": "^19.0.0",
          },
          devDependencies: {
            "@types/node": "^20.11.0",
            "@types/react": "^19.0.0",
            "@types/react-dom": "^19.0.0",
            autoprefixer: "^10.4.20",
            postcss: "^8.4.49",
            tailwindcss: "^3.4.17",
            typescript: "^5.6.0",
          },
        },
        null,
        2
      ) + "\n",
  });

  files.push({
    path: "tsconfig.json",
    content:
      JSON.stringify(
        {
          compilerOptions: {
            target: "ES2017",
            lib: ["dom", "dom.iterable", "esnext"],
            allowJs: true,
            skipLibCheck: true,
            strict: true,
            noEmit: true,
            esModuleInterop: true,
            module: "esnext",
            moduleResolution: "bundler",
            resolveJsonModule: true,
            isolatedModules: true,
            jsx: "preserve",
            incremental: true,
            plugins: [{ name: "next" }],
            paths: { "@/*": ["./*"] },
          },
          include: [
            "next-env.d.ts",
            "**/*.ts",
            "**/*.tsx",
            ".next/types/**/*.ts",
          ],
          exclude: ["node_modules"],
        },
        null,
        2
      ) + "\n",
  });

  files.push({
    path: "next.config.mjs",
    content:
      "/** @type {import('next').NextConfig} */\n" +
      "const nextConfig = {};\n" +
      "export default nextConfig;\n",
  });

  files.push({
    path: "postcss.config.mjs",
    content:
      "export default {\n" +
      "  plugins: {\n" +
      "    tailwindcss: {},\n" +
      "    autoprefixer: {},\n" +
      "  },\n" +
      "};\n",
  });

  files.push({
    path: "tailwind.config.ts",
    content:
      "import type { Config } from \"tailwindcss\";\n\n" +
      "const config: Config = {\n" +
      "  content: [\"./app/**/*.{ts,tsx}\"],\n" +
      "  theme: { extend: {} },\n" +
      "  plugins: [],\n" +
      "};\n\n" +
      "export default config;\n",
  });

  files.push({
    path: "app/globals.css",
    content:
      "@tailwind base;\n" +
      "@tailwind components;\n" +
      "@tailwind utilities;\n\n" +
      "body {\n  margin: 0;\n}\n",
  });

  files.push({
    path: "app/layout.tsx",
    content:
      "import type { Metadata } from \"next\";\n" +
      'import "./globals.css";\n\n' +
      "export const metadata: Metadata = {\n" +
      `  title: ${JSON.stringify(name)},\n` +
      `  description: ${JSON.stringify(purpose)},\n` +
      "};\n\n" +
      "export default function RootLayout({\n" +
      "  children,\n" +
      "}: {\n" +
      "  children: React.ReactNode;\n" +
      "}) {\n" +
      "  return (\n" +
      '    <html lang="es">\n' +
      "      <body>{children}</body>\n" +
      "    </html>\n" +
      "  );\n" +
      "}\n",
  });

  files.push({
    path: "app/page.tsx",
    content:
      "export default function Home() {\n" +
      "  return (\n" +
      `    <main style={{ backgroundColor: "${background}", color: "#f5f5f5" }} className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">\n` +
      `      <h1 style={{ color: "${accent}" }} className="text-4xl font-extrabold tracking-tight sm:text-5xl">\n` +
      `        ${nameJsx}\n` +
      "      </h1>\n" +
      `      <p className="max-w-xl text-sm opacity-80 sm:text-base">\n${purposeJsx}\n      </p>\n` +
      '      <span className="mt-2 text-[11px] uppercase tracking-widest opacity-40">Generado por Forge Core01</span>\n' +
      "    </main>\n" +
      "  );\n" +
      "}\n",
  });

  files.push({
    path: ".gitignore",
    content:
      "# dependencies\n/node_modules\n\n" +
      "# next.js\n/.next/\n/out/\n\n" +
      "# production\n/build\n\n" +
      "# misc\n.DS_Store\n*.pem\n\n" +
      "# debug\nnpm-debug.log*\nyarn-debug.log*\nyarn-error.log*\n\n" +
      "# env\n.env*.local\n.env\n\n" +
      "# typescript\n*.tsbuildinfo\n",
  });

  files.push({
    path: "Dockerfile",
    content:
      "FROM node:20-alpine\n\n" +
      "WORKDIR /app\n" +
      "ENV NEXT_TELEMETRY_DISABLED=1\n\n" +
      "COPY package.json ./\n" +
      "RUN npm install --no-audit --no-fund\n\n" +
      "COPY . .\n\n" +
      "RUN npm run build\n\n" +
      "EXPOSE 3000\n" +
      'CMD ["npm", "run", "start"]\n',
  });

  files.push({
    path: ".dockerignore",
    content: "node_modules\n.next\n.git\n",
  });

  files.push({
    path: "public/favicon.svg",
    content:
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
      `<rect width="64" height="64" rx="14" fill="${background}"/>` +
      `<circle cx="32" cy="32" r="14" fill="${accent}"/></svg>\n`,
  });

  return files;
}
