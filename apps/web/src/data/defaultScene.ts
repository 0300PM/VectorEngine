export const defaultScene = `{
  "version": "1.0",
  "gradients": [
    {
      "id": "core-gradient",
      "type": "linear",
      "x1": 0,
      "y1": 0,
      "x2": 1,
      "y2": 1,
      "stops": [
        { "offset": 0, "color": "#0052FF" },
        { "offset": 1, "color": "#0037B8" }
      ]
    },
    {
      "id": "halo-gradient",
      "type": "radial",
      "cx": 0.5,
      "cy": 0.5,
      "r": 0.5,
      "stops": [
        { "offset": 0, "color": "#0052FF26" },
        { "offset": 1, "color": "#0052FF00" }
      ]
    }
  ],
  "document": {
    "width": 1200,
    "height": 800,
    "unit": "px",
    "background": "#F4F7FF",
    "workspaces": [
      {
        "id": "hero-card",
        "name": "Hero Card",
        "x": 80,
        "y": 80,
        "width": 1040,
        "height": 640
      },
      {
        "id": "center-emblem",
        "name": "Center Emblem",
        "x": 450,
        "y": 238,
        "width": 300,
        "height": 300
      }
    ]
  },
  "objects": [
    {
      "id": "frame",
      "name": "Card Frame",
      "layerId": "surface",
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
      "id": "core-halo",
      "name": "Ambient Halo",
      "layerId": "surface",
      "type": "circle",
      "cx": 600,
      "cy": 388,
      "radius": 180,
      "fill": "url(#halo-gradient)"
    },
    {
      "id": "orbit-a",
      "name": "Primary Orbit",
      "layerId": "orbits",
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
      "name": "Secondary Orbit",
      "layerId": "orbits",
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
      "name": "Core Sphere",
      "layerId": "core-system",
      "type": "circle",
      "cx": 600,
      "cy": 388,
      "radius": 108,
      "fill": "url(#core-gradient)"
    },
    {
      "id": "core-ring",
      "name": "Inner Ring",
      "layerId": "core-system",
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
      "id": "satellites",
      "name": "Orbit Satellites",
      "layerId": "orbits",
      "type": "group",
      "children": [
        {
          "id": "node-a",
          "name": "North Node",
          "type": "circle",
          "cx": 900,
          "cy": 330,
          "radius": 18,
          "fill": "#171717"
        },
        {
          "id": "node-b",
          "name": "South Node",
          "type": "circle",
          "cx": 382,
          "cy": 552,
          "radius": 13,
          "fill": "#FF8A00"
        },
        {
          "id": "guide-grid",
          "name": "Alignment Guide",
          "type": "rect",
          "x": 450,
          "y": 238,
          "width": 300,
          "height": 300,
          "fill": "none",
          "stroke": "#94A3B8",
          "strokeWidth": 1,
          "visible": false
        }
      ]
    },
    {
      "id": "title",
      "name": "Headline",
      "layerId": "typography",
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
      "name": "Subheadline",
      "layerId": "typography",
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
      "name": "Footer Caption",
      "layerId": "typography",
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
