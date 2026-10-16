export const defaultScene = `{
  "version": "1.0",
  "document": {
    "width": 1200,
    "height": 800,
    "unit": "px",
    "background": "#F4F7FF"
  },
  "objects": [
    {
      "id": "frame",
      "type": "rect",
      "x": 80,
      "y": 80,
      "width": 1040,
      "height": 640,
      "rx": 40,
      "fill": "#FFFFFF",
      "stroke": "#DDE5F5",
      "strokeWidth": 2
    },
    {
      "id": "orbit-a",
      "type": "ellipse",
      "cx": 600,
      "cy": 388,
      "rx": 310,
      "ry": 126,
      "fill": "none",
      "stroke": "#B8C9F4",
      "strokeWidth": 3,
      "transform": {
        "rotate": -12,
        "originX": 600,
        "originY": 388
      }
    },
    {
      "id": "orbit-b",
      "type": "ellipse",
      "cx": 600,
      "cy": 388,
      "rx": 310,
      "ry": 126,
      "fill": "none",
      "stroke": "#B8C9F4",
      "strokeWidth": 3,
      "transform": {
        "rotate": 48,
        "originX": 600,
        "originY": 388
      }
    },
    {
      "id": "core",
      "type": "circle",
      "cx": 600,
      "cy": 388,
      "radius": 108,
      "fill": "#0052FF"
    },
    {
      "id": "core-ring",
      "type": "circle",
      "cx": 600,
      "cy": 388,
      "radius": 72,
      "fill": "none",
      "stroke": "#FFFFFF",
      "strokeWidth": 3,
      "opacity": 0.45
    },
    {
      "id": "node-a",
      "type": "circle",
      "cx": 900,
      "cy": 330,
      "radius": 18,
      "fill": "#171717"
    },
    {
      "id": "node-b",
      "type": "circle",
      "cx": 382,
      "cy": 552,
      "radius": 13,
      "fill": "#FF8A00"
    },
    {
      "id": "title",
      "type": "text",
      "x": 600,
      "y": 386,
      "content": "VECTOR",
      "fontSize": 28,
      "fontWeight": 700,
      "textAnchor": "middle",
      "fill": "#FFFFFF",
      "letterSpacing": 5
    },
    {
      "id": "subtitle",
      "type": "text",
      "x": 600,
      "y": 416,
      "content": "ENGINE",
      "fontSize": 15,
      "fontWeight": 600,
      "textAnchor": "middle",
      "fill": "#FFFFFF",
      "letterSpacing": 7,
      "opacity": 0.72
    },
    {
      "id": "caption",
      "type": "text",
      "x": 600,
      "y": 658,
      "content": "JSON IN  ·  PIXELS OUT",
      "fontSize": 14,
      "fontWeight": 600,
      "textAnchor": "middle",
      "fill": "#737373",
      "letterSpacing": 3
    }
  ]
}`
