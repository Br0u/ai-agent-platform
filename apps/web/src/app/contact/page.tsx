import Link from "next/link";
import type { Metadata } from "next";
import { ContactBackButton } from "./contact-back-button";
import "./contact.css";

const lead =
  "无论是产品咨询、方案交流、体验申请还是商务合作，留下您的需求，我们的顾问将尽快与您联系。";

export const metadata: Metadata = {
  title: "联系我们 · 华鲲",
  description: lead,
};

type ContactSearchParams = Record<string, string | string[] | undefined>;

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<ContactSearchParams>;
}) {
  const rawTopic = (await searchParams).topic;
  const topic = (Array.isArray(rawTopic) ? rawTopic[0] : rawTopic)?.trim();

  return (
    <main className="contact-page">
      <nav className="contact-return" aria-label="联系我们返回导航">
        <ContactBackButton />
      </nav>

      <section className="contact-hero">
        <div className="contact-frame contact-hero__layout">
          <div>
            <p className="contact-eyebrow">联系我们｜商务咨询</p>
            <h1>期待与您交流，共创企业 AI 未来</h1>
            <p className="contact-lead">{lead}</p>
            <ul className="contact-tags" aria-label="咨询类型">
              {["产品咨询", "方案交流", "体验申请", "商务合作"].map((value) => (
                <li key={value}>{value}</li>
              ))}
            </ul>
          </div>

          <section className="contact-card" aria-label="联系信息">
            <h2>联系信息</h2>
            <dl>
              <div>
                <dt>公司地址</dt>
                <dd>四川省成都市双流区新程南一路 19 号 · AI 创新中心 F6 栋</dd>
              </div>
              <div>
                <dt>商务合作</dt>
                <dd>商务合作邮箱待确认</dd>
              </div>
              <div>
                <dt>客服热线</dt>
                <dd>客服热线待确认</dd>
              </div>
              <div>
                <dt>服务时间</dt>
                <dd>工作日 9:00 – 18:00</dd>
              </div>
            </dl>
            {topic ? (
              <p className="contact-topic">
                当前咨询主题：<strong>{topic}</strong>
              </p>
            ) : null}
          </section>
        </div>
      </section>

      <section className="contact-more" id="contact-more">
        <div className="contact-frame contact-more__panel">
          <div>
            <h2>更多了解华鲲</h2>
            <p>查看产品中心、解决方案与合作伙伴，全面了解华鲲产品与生态。</p>
          </div>
          <div className="contact-actions">
            <Link href="/product">进入产品中心</Link>
            <Link href="/solutions">查看解决方案</Link>
            <Link href="/partners">了解合作伙伴</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
