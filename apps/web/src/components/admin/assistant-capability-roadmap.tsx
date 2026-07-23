const CAPABILITIES = [
  {
    title: "本地算力",
    status: "预留 / 未连接",
    description: "Ollama、vLLM、OpenAI-compatible、自有模型仓库",
    available: false,
  },
  {
    title: "Skill 加载",
    status: "Registry / Agent 运行时已接入",
    description: "审核版本组成集合并激活后，由 Agent 按 exact revision 加载",
    available: true,
  },
  {
    title: "知识库",
    status: "未接入",
    description: "未来承载文档、网页内容和检索",
    available: false,
  },
  {
    title: "网页与操作工具",
    status: "未接入",
    description: "未来承载外部动作、审批和浏览器操作",
    available: false,
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
          <span>Skill 审核、配置和 Agent 运行时加载已接入。</span>
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
              {capability.available ? (
                <span className="assistant-capability-roadmap__availability">
                  已接入
                </span>
              ) : (
                <button
                  aria-label={`${capability.title}暂不可用`}
                  disabled
                  type="button"
                >
                  暂不可用
                </button>
              )}
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}
