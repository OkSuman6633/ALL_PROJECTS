# Premium UI refresh

The dashboard UI has been refreshed without adding runtime dependencies or changing the backend API contracts.

## Visual direction
- Editorial operations-intelligence dashboard with warm mineral backgrounds, deep evergreen surfaces, mint/lime accents, subtle borders and elevated translucent panels.
- Hero visual is inline SVG/CSS, so no external image asset is required for the decorative illustration.
- Strong typographic hierarchy, compact mono labels, calmer spacing, and consistent controls.

## Motion and interaction
- Entrance animation for the application and primary panels.
- Animated status indicator, floating hero core, rotating orbital rings, and subtle chart bars.
- Hover/focus feedback for buttons, activity facts, assessment rows, scenarios and recommendations.
- Responsive layouts for desktop, tablet and mobile.
- `prefers-reduced-motion` support to reduce motion for users who request it.

## Notes
- Google Fonts are loaded from Google Fonts with system fallbacks. If the network is unavailable, the dashboard falls back to installed fonts.
- This is a visual enhancement only. It does not upgrade authentication or change backend security properties.
- The frontend production build was not verified in this environment because dependency installation timed out. Run `npm install` and `npm run build` in `web/` on a network-enabled development machine.
