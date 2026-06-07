export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8">
      <div className="max-w-2xl w-full space-y-8 text-center">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight text-white">
            Projects Community
          </h1>
          <p className="text-lg text-zinc-400">
            Local-first research workspace with AI-powered decision making
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { icon: "🏛️", title: "Projects", desc: "Organize research around meaningful goals" },
            { icon: "⚖️", title: "Decisions", desc: "Structure your choices with dimensions & candidates" },
            { icon: "🗺️", title: "Community Map", desc: "Watch your research neighborhood grow" },
          ].map((card) => (
            <div
              key={card.title}
              className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-left space-y-1"
            >
              <div className="text-2xl">{card.icon}</div>
              <h3 className="font-semibold text-white">{card.title}</h3>
              <p className="text-sm text-zinc-500">{card.desc}</p>
            </div>
          ))}
        </div>

        <div className="space-y-2 text-sm text-zinc-500">
          <p>🤖 AI Realizer — your structured research companion</p>
          <p>🌱 Decisions grow from research → deferred → decided</p>
          <p>📍 Buildings on the map reflect project progress</p>
        </div>

        <div className="flex justify-center gap-4">
          <a
            href="/projects"
            className="rounded-full bg-white px-6 py-2.5 text-sm font-medium text-black hover:bg-zinc-200 transition"
          >
            View Projects
          </a>
          <a
            href="/decisions"
            className="rounded-full border border-zinc-700 px-6 py-2.5 text-sm font-medium text-zinc-300 hover:border-zinc-500 transition"
          >
            View Decisions
          </a>
        </div>
      </div>
    </div>
  );
}