import { defineConfig } from "vite";
import wasm from "vite-plugin-wasm";
import fs from "fs";
import path from "path";
import pkg from './package.json' assert { type: 'json' };

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  },
  build: {
    lib: {
      entry: "src/rapierWorker.js",
      name: "RapierWorker",
      fileName: "rapier-worker",
      formats: ["es"],
    },
    outDir: "dist-worker",
    rollupOptions: {
      external: [
        './rapierObjectUtils.js'
      ],
    },
  },
  plugins: [
    // viteStaticCopy({
    //   targets: [
    // 	   { src: 'a',
    //       dest: 'b',
    // 	   },
    //   ],
    // });
    // react(),
    // wasm(),
    {
      name: "copy-rapierObjectUtils.js-to-dist-worker",
      closeBundle() {
	//** When `compat' version is imported, WASM is embedded
	//   in JS, so no need to copy it.
	const distDir = path.resolve(__dirname, "dist-worker");
	['rapierObjectUtils.js'].forEach((file)=>{
	  fs.copyFileSync(path.join('src', file),
			  path.join(distDir, file));
	});
	// ** copy rapier worker to public&dist dir for main thread 
	// const publicDir = path.resolve(__dirname, "../main/public");
	// const mainDistDir = path.resolve(__dirname, "../main/dist");
	// //** Copy all files in `distDir' directory.
	// fs.readdirSync(distDir).forEach((file) => {
	//   fs.copyFileSync(path.join(distDir, file),
	//   		  path.join(publicDir, file));
	//   fs.copyFileSync(path.join(distDir, file),
	// 		  path.join(mainDistDir, file));
	// });
      },
    },
  ],
});
