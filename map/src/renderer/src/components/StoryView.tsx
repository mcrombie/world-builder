export function StoryView() {
  return (
    <div className="flex-1 flex items-center justify-center bg-gray-950 text-gray-100">
      <div className="max-w-lg text-center flex flex-col gap-5 px-8">

        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold text-gray-100">Story Mode</h1>
          <p className="text-sm text-indigo-400 uppercase tracking-widest">Coming soon</p>
        </div>

        <p className="text-sm text-gray-400 leading-relaxed">
          An interactive world-building experience — guided through the creation
          of your world as a text adventure, alongside the map editor tools.
          Describe your world in natural language, and watch it take shape.
        </p>

        <div className="flex flex-col gap-2 text-sm text-gray-600 border border-gray-800 rounded-lg p-4 text-left">
          <p className="text-gray-500 font-medium mb-1">Planned</p>
          <p>— Narrative-guided world creation</p>
          <p>— Text adventure interface alongside the map</p>
          <p>— Geography, culture, and history built through conversation</p>
          <p>— Integration with Clashvergence simulation</p>
        </div>

      </div>
    </div>
  )
}
