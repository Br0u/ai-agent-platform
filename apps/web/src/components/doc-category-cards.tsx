type SubCategory = {
  id: string;
  title: string;
  description: string;
};

export function DocCategoryCards({
  subCategories,
}: {
  subCategories: readonly SubCategory[];
}) {
  return (
    <div className="doc-cards-grid">
      {subCategories.map((sub) => {
        return (
          <a href={`#${sub.id}`} key={sub.id} className="doc-card">
            <div className="doc-card__icon">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
            </div>
            <h3 className="doc-card__title">{sub.title}</h3>
            <p className="doc-card__desc">{sub.description}</p>
          </a>
        );
      })}
    </div>
  );
}
