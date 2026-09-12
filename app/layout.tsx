import "./globals.css";

export const metadata = {
  title: "OdKarla hlídač",
  description: "Osobní hlídač nového zboží a slev na OdKarla.cz",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="cs">
      <body>{children}</body>
    </html>
  );
}
