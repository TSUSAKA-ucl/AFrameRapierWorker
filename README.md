# Animating objects in A-Frame using Rapier

Please refer to
[`ReactAFrameRapierTest`](https://github.com/TSUSAKA-ucl/ReactAFrameRapierTest.git)
for usage instructions. 
Add the following line to [`package.json`](https://github.com/TSUSAKA-ucl/ReactAFrameRapierTest/blob/main/package.json):
```
  "dependencies": {
    "@ucl-nuee/rapier-worker": "https://github.com/TSUSAKA-ucl/AFrameRapierWorker/releases/download/ver.0.1.0/ucl-nuee-rapier-worker-0.1.0.tgz"
  },
```
This will allow the module to be automatically installed from
`github.com` using `pnpm install`.

We recommend automatically copying
`rapier-worker.mjs` and `rapierObjectUtils.js` to the `dist/` directory
during build, as described in `ReactAFrameRapierTest`'s [`vite.config.mjs`](https://github.com/TSUSAKA-ucl/ReactAFrameRapierTest/blob/main/vite.config.mjs).
Your own `public/physicalObj.config.js` should also be copied to the
same location (`dist`) (usually automatically).

When you define Rapier objects in `physicalObj.config.js` and add a
`RapierWorker` virtual DOM like in
[`main.jsx`](https://github.com/TSUSAKA-ucl/ReactAFrameRapierTest/blob/main/src/main.jsx),
the worker will load the above definition file, Rapier will start
working, and `RapierWorker` componet will wait until the `a-scene` is loaded
before starting to draw the Rapier object.

In `physicalObj.config.js`, you must define `rigidBodyArray`,
`jointArray`, and `functionArray`.
Even if you don't need them, please define `[]`.
The function can be called only once when a command(`call`) is issued
from the main thread, or can be called every time rapier's `world.step()` 
is called (`activate`/`deactivate`). 
Please refer to `case 0`, `case 1`, and `case 3` of the `menu-select` 
event listener in [`VrControllerComponents.jsx`](https://github.com/TSUSAKA-ucl/ReactAFrameRapierTest/blob/0d58193750fe30e794b4286c5fe2b6c1ee26150f/src/VrControllerComponents.jsx#L135).

For information on which files are bound (or not bound), see [File
Tree Configuration (Japanese)](FileTree.md).
