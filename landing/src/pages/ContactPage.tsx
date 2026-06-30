import { motion } from 'framer-motion'
import ContactInfo from '../components/ContactInfo'

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-20">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <ContactInfo />
      </motion.div>
    </div>
  )
}
