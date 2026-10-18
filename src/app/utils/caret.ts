// Pixel position of a caret inside a textarea, measured with a hidden mirror
// element that copies the textarea's text layout. Used to open the [[ autocomplete
// right where the DM is typing.

const MIRRORED_PROPERTIES = [
  'boxSizing', 'width', 'overflowX', 'overflowY',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize', 'lineHeight', 'fontFamily',
  'textAlign', 'textTransform', 'textIndent', 'letterSpacing', 'wordSpacing', 'tabSize',
] as const;

export interface CaretCoordinates {
  top: number; // relative to the textarea's border box, ignoring scroll
  left: number;
  lineHeight: number;
}

export function getCaretCoordinates(textarea: HTMLTextAreaElement, position: number): CaretCoordinates {
  const style = window.getComputedStyle(textarea);
  const mirror = document.createElement('div');
  for (const property of MIRRORED_PROPERTIES) {
    mirror.style[property] = style[property];
  }
  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.overflowWrap = 'break-word';
  mirror.textContent = textarea.value.slice(0, position);

  const marker = document.createElement('span');
  marker.textContent = textarea.value.slice(position) || '.';
  mirror.appendChild(marker);
  document.body.appendChild(mirror);

  const fontSize = parseFloat(style.fontSize);
  const coordinates = {
    top: marker.offsetTop + parseFloat(style.borderTopWidth),
    left: marker.offsetLeft + parseFloat(style.borderLeftWidth),
    lineHeight: parseFloat(style.lineHeight) || fontSize * 1.2,
  };
  document.body.removeChild(mirror);
  return coordinates;
}
