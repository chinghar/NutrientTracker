type RuleColor = "poppy" | "avocado" | "toast";

const COLOR_CLASSES: Record<RuleColor, string> = {
  poppy: "border-poppy",
  avocado: "border-avocado",
  toast: "border-toast/40",
};

/** A thick printed-rule divider — the item separator throughout the app, instead of bordered cards with a shadow. */
export default function Rule({ color = "toast" }: { color?: RuleColor }) {
  return <hr className={`border-t-4 ${COLOR_CLASSES[color]}`} />;
}
