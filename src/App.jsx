import Header from './components/Header'
import Hero from './components/Hero'
import Products from './components/Products'
import WhyUs from './components/WhyUs'
import Location from './components/Location'
import Contact from './components/Contact'
import Footer from './components/Footer'
import WhatsappFloat from './components/WhatsappFloat'

export default function App() {
  return (
    <div className="min-h-screen bg-white font-sans text-amber-950">
      <Header />
      <main>
        <Hero />
        <Products />
        <WhyUs />
        <Location />
        <Contact />
      </main>
      <Footer />
      <WhatsappFloat />
    </div>
  )
}
