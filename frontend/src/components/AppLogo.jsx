export default function AppLogo({ size = 52, className = '' }) {
  return (
    <img
      src="/logo-leaves.png?v=3"
      alt="لوگوی شاروالی هوشمند"
      className={`app-logo ${className}`}
      width={size}
      height={size}
      style={{ width: size, height: size, objectFit: 'contain', background: 'transparent' }}
    />
  );
}
