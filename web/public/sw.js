/* 只为满足 Chrome 的「可安装」判定：必须存在一个注册了 fetch 事件的
 * service worker，否则安卓上「添加到主屏幕」只会生成一个书签快捷方式，
 * 而不是有独立窗口和图标的应用。
 *
 * 刻意不做任何缓存——错题数据必须实时，离线缓存只会带来「改了没生效」
 * 这类难查的问题。空的 fetch 监听即满足判定，浏览器照常走网络。 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
