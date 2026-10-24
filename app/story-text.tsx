export function StoryText({text = ""}: {text?: string}) {
  return <>{text.split(/(\*\*[^*\r\n]+\*\*)/g).map((part, index) =>
    index % 2 ? <strong className="story-emphasis" key={index}>{part.slice(2, -2)}</strong> : part
  )}</>;
}
