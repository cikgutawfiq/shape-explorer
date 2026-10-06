# Geometry3D

An interactive geometry site for primary school students. Fold and unfold 3D shapes into their nets, count faces, edges and vertices, explore flat 2D shapes, then test yourself with a quiz.

## Features

- **Unfold / fold slider** for the cube, cuboid, prisms (3–8 sides), pyramids (3–8 sides), cylinder and cone, with a play button and a short welcome animation.
- **Count along**: tap *Faces*, *Edges* or *Vertices* and numbers appear one by one on the shape (hidden ones are dimmed).
- **Spin and zoom** with mouse, touch or pinch. **Full screen** button (with an in-page fallback for iPhone).
- **Spot it in real life** examples, a "Did you know?" fact and Euler's formula for every solid.
- **2D shapes** with side/corner counting, right angles and lines of symmetry, plus links to the 3D shapes that contain them.
- **Games**: a 10-question quiz, a memory card game and a match-the-pairs game.
- Mobile first, keyboard accessible, respects reduced-motion.

## How the unfolding works

`js/net.js` is a small, generic engine: give it a solid (vertices + faces) and a spanning tree saying which faces stay joined. It lays the faces flat as a net, then folds each face about the hinge it shares with its parent by the angle between their normals. Cylinders and cones are 64-sided prisms/pyramids with smooth shading, so the same maths rolls them up. `npm test` checks that every fold closes exactly and no net overlaps itself.

## Run locally

No build step. Any static server works:

```bash
npm install      # only needed to refresh the vendored three.js
npm run serve    # http://localhost:5173
npm test         # sanity-checks the nets
```

`vendor/` holds the three.js files the site uses (`npm run vendor` regenerates them), so the site works offline and has no CDN dependency apart from Google Fonts (it falls back to system fonts).

## Deploy

Static site, deployed on Vercel (`vercel.json` sets caching and security headers). Import the repo in Vercel with the "Other" framework preset and no build command.
