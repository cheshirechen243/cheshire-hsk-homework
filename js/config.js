// ============================================================
//  站点配置 / Cấu hình
//  第一步:不用改任何东西 —— 没填 firebase 时自动进入「演示模式」(数据只存在当前浏览器)
//  第二步:按 SETUP.md 创建 Firebase 项目,把下面 firebase 的内容替换成你自己的
// ============================================================
window.HSK_CONFIG = {
  siteName: '沉鱼汉语 · NEW HSK 3.0 COURSE',

  // 老师账号(可以多个)。只有这些邮箱能进入老师后台
  teacherEmails: ['cheshirechen243@gmail.com'],

  // Firebase 网页应用配置(留空 = 演示模式)
  firebase: {
    apiKey: "AIzaSyCOBCJjfKl-LiBV5HlSwaH4E4gfOwNpoEE",
  authDomain: "cheshire-hsk-homework.firebaseapp.com",
  projectId: "cheshire-hsk-homework",
  storageBucket: "cheshire-hsk-homework.firebasestorage.app",
  messagingSenderId: "735184866211",
  appId: "1:735184866211:web:84964e9192fabfd8be2816"
  },


  // 批改完成后自动发邮件通知学生:填 Apps Script 网页应用地址(步骤见 firebase/mail-appscript.gs 开头或 SETUP.md 第 4 步)。留空 = 点「通知学生」时打开 Gmail 写信窗口
  mailEndpoint: 'https://script.google.com/macros/s/AKfycbw2TKV1Unh6Jp7VBl4Cm8XK3iWpV24wuI2dkIKmreevGVPeiX9-Lv02VqxnCL0-tuVfag/exec',
  mailSecret: '',

  contact: {
    messenger: 'https://m.me/cherrychen310',
    zalo: '0966624399',
    email: 'cheshirechen243@gmail.com'
  }
};
