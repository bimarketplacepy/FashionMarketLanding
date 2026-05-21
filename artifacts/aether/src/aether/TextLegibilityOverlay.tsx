export default function TextLegibilityOverlay() {
  return (
    <div className="absolute inset-0 pointer-events-none z-[5]">
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(to right, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.4) 30%, rgba(0,0,0,0.1) 50%, rgba(0,0,0,0) 65%)'
        }}
      />
      <div
        className="absolute left-0 right-0 bottom-0"
        style={{
          height: '200px',
          background:
            'linear-gradient(to top, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 100%)'
        }}
      />
    </div>
  );
}
