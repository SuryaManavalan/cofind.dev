// iOS 26.5 killed programmatic switch haptics; a *genuine* tap on a real
// <input type="checkbox" switch> still fires the Taptic Engine. This renders
// one invisibly over the parent (which must be position:relative) so the
// user's actual finger toggles it — haptic fires — and the click bubbles up
// to the parent's onClick unchanged. Inert everywhere else: invisible,
// unfocusable, hidden from assistive tech.
export default function HapticOverlay() {
  return (
    <input
      type="checkbox"
      tabIndex={-1}
      aria-hidden="true"
      onChange={() => {}}
      className="absolute inset-0 z-10 m-0 size-full cursor-[inherit] appearance-none rounded-[inherit] border-0 bg-transparent p-0 opacity-0"
      {...({ switch: "" } as Record<string, string>)}
    />
  );
}
