import Link from "next/link";

/* 数据说明。不拦路，从首页角落链过来。
 *
 * 原则：如实说清楚，不写「我们承诺保护您的隐私」这种空话。尤其是照片会发给
 * 第三方模型这一条——家长迟早会问「照片传到哪去了」，不写就是隐瞒。 */
export const metadata = { title: "数据说明" };

export default function AboutPage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col gap-4 bg-white px-5 py-8 dark:bg-neutral-950">
      <div>
        <h1 className="text-lg font-semibold">数据说明</h1>
        <p className="mt-1 text-sm text-neutral-500">个人业余项目，免费，不收费。</p>
      </div>

      <Item title="会收集什么">
        你拍的作业照片。照片里通常有孩子的<b>姓名和笔迹</b>，可能还有学校名称。
        以及你填的正确答案、每道题的对错记录。
      </Item>

      <Item title="存在哪里">
        腾讯云上海的服务器和对象存储，都在中国境内。图片不公开，只能通过带签名的
        临时链接读取。
      </Item>

      <Item title="会不会给别人">
        开启「自动找题」时，作业照片会发给<b>月之暗面（Kimi）的模型接口</b>，
        用来框出页面上有哪几道题。这是境内厂商，照片不出境。除此之外不给任何第三方，
        不用于广告。
      </Item>

      <Item title="留多久">
        原图计划保留 90 天，题目裁剪图长期保留（复习卷要用）。你随时可以要我删掉
        全部数据。
      </Item>

      <Item title="传输安全">
        网站走 HTTPS，照片和登录状态在网络上是加密的。
      </Item>

      <Item title="你的登录链接">
        你收到的登录链接就是你家的钥匙，<b>转发给别人等于把数据给了对方</b>。
        不小心发出去了告诉我，我可以作废重发一条。
      </Item>

      <Link href="/" className="mt-2 text-center text-sm text-neutral-500">
        返回
      </Link>
    </div>
  );
}

function Item({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-neutral-200 p-3.5 dark:border-neutral-800">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mt-1 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">{children}</p>
    </section>
  );
}
