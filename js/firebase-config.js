// ===== Firebase の設定 =====
// マートメイツ用の Firebase プロジェクト（supermarket-9acfb）。
// ウェブ用の apiKey は公開される前提の値です。データを守るのは「データベースのルール」と「匿名ログイン」なので、
// README.md の「Firebaseの設定」にあるルール（database.rules.json）を必ず公開しておいてください。
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCmGEsZf7oLeOT6FWEQ8YWJOaNmv6Z-Ewc',
  authDomain: 'supermarket-9acfb.firebaseapp.com',
  databaseURL: 'https://supermarket-9acfb-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'supermarket-9acfb',
  // storageBucket / messagingSenderId / appId はこのゲームでは使わないので省略しています（あれば追加してもOK）
};
