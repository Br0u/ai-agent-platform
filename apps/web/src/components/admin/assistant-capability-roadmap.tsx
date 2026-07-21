const CAPABILITIES = [
  {
    title: "本地算力",
    status: "预留 / 未连接",
    description: "Ollama、vLLM、OpenAI-compatible、自有模型仓库",
  },
  {
    title: "Skill 加载",
    status: "Registry 已接入 / Agent 运行时待接",
    description: "审核库可用，Agent 尚未加载任何 Skill",
  },
  {
    title: "知识库",
    status: "未接入",
    description: "未来承载文档、网页内容和检索",
  },
  {
    title: "网页与操作工具",
    status: "未接入",
    description: "未来承载外部动作、审批和浏览器操作",
  },
] as const;

export function AssistantCapabilityRoadmap() {
  return (
    <section
      aria-labelledby="assistant-capability-roadmap-title"
      className="assistant-capability-roadmap"
    >
      <header className="assistant-capability-roadmap__heading">
        <div>
          <p>CAPABILITY ROADMAP</p>
          <h2 id="assistant-capability-roadmap-title">后续能力入口</h2>
          <span>Skill 审核库可用；连接、运行时加载和操作能力尚未开放。</span>
        </div>
        <strong>部分接入</strong>
      </header>
      <ul className="assistant-capability-roadmap__grid">
        {CAPABILITIES.map((capability) => (
          <li data-testid="assistant-capability-card" key={capability.title}>
            <article>
              <header>
                <h3>{capability.title}</h3>
                <span>{capability.status}</span>
              </header>
              <p>{capability.description}</p>
              <button
                aria-label={`${capability.title}暂不可用`}
                disabled
                type="button"
              >
                暂不可用
              </button>
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}
