# ファイルツリーの構成

現在のjsのパッケージのファイル構成は以下のとおりで、`dist-worker/`に
生成物が集まり、ユーザーはpackageをビルドする時にこの`dist-worker/`以下を自分の
`dist/`にコビーする。`src/ReactRapierWorker.jsx`はトランスパイルされずに
そのままexportし、ユーザーがpackageをビルドする時に(必要ならば)バインドする。

workerは起動後に、ユーザーが作成した(ユーザーの`dist/`にある)定義ファイル
(`physicalObj.config.js`)を動的importで読み込み、ページが動き出す。
```
this_package_root/
├─ .git/
├─ README.md
├─ FileTree.md
├─ dist-worker/
├─ node_modules/
├─ package.json
├─ package.json
├─ pnpm-lock.yaml
├─ pnpm-workspace.yaml
├─ src/
│  ├─ ReactRapierWorker.jsx
│  ├─ rapierObjectUtils.js
│  └─ rapierWorker.js
└─ vite.config.mjs
```

ユーザーは`main/src/App.css`,`main/src/App.jsx`,
`main/public/physicalObj.config.js`を書く。
viteでバインドしている場合は、例を参考に`vite.config.mjs`に、
上記の`dist-worker/`から自分の`dist/`へのコピーを書いておく。
