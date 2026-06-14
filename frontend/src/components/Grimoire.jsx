import React, { useState } from 'react';
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from 'framer-motion';
import { FaChevronLeft, FaSearch } from 'react-icons/fa';
import toast from 'react-hot-toast';

export function Grimoire({ inventory, isOpen, onClose }) {
  const [searchTerm, setSearchTerm] = useState("");

  // Filter list based on search
  const filteredItems = inventory.filter(item => 
    item.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Dark Glass Backdrop Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
          />

          {/* Premium Dark Glassmorphic Side Drawer */}
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 left-0 h-full w-80 bg-gray-950/95 backdrop-blur-2xl border-r border-white/10 shadow-2xl z-50 flex flex-col"
          >
            
            {/* Header */}
            <div className="p-6 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-gray-900 to-gray-950">
              <div>
                <h2 className="text-lg font-light tracking-widest uppercase text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]">
                  Grimoire
                </h2>
                <p className="text-[10px] text-blue-400/80 font-mono mt-1">
                  TOTAL DISCOVERIES: {inventory.length}
                </p>
              </div>
              <button 
                onClick={onClose} 
                className="p-2 hover:bg-white/5 hover:text-white rounded-full text-gray-400 transition-colors duration-200 cursor-pointer"
                title="Close Grimoire"
              >
                <FaChevronLeft />
              </button>
            </div>

            {/* Search Bar */}
            <div className="px-6 py-4">
              <div className="relative group">
                <FaSearch className="absolute left-3 top-3 text-gray-500 group-focus-within:text-blue-400 transition-colors" />
                <input 
                  type="text" 
                  placeholder="Search collection..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-black/40 border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 transition-all" 
                />
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent">
              {filteredItems.length === 0 ? (
                <div className="text-center mt-20 opacity-40">
                  <p className="text-sm font-light text-gray-400">No matching elements.</p>
                </div>
              ) : (
                filteredItems.map((item, index) => (
                  <motion.div 
                    key={item.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(index * 0.03, 0.3) }}
                    onClick={() => {
                      const discoverer = item.discoveredBy || "Unknown";
                      toast(`"${item.name}" was discovered by: ${discoverer}`, {
                        icon: discoverer === "God" ? '👑' : '🧙‍♂️',
                        style: {
                          background: '#1f2937',
                          color: '#fff',
                          border: '1px solid rgba(255, 255, 255, 0.1)'
                        }
                      });
                    }}
                    className="group relative p-3 rounded-lg border border-white/5 bg-gray-900/30 hover:border-blue-500/30 hover:bg-blue-500/5 transition-all cursor-pointer flex items-center gap-4"
                  >
                    {/* Image Thumbnail */}
                    <div className="w-12 h-12 rounded-lg bg-black/30 border border-white/10 flex items-center justify-center overflow-hidden shadow-sm shrink-0">
                      {item.image ? (
                         <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                      ) : (
                         <div className="w-4 h-4 rounded-full bg-gray-700" />
                      )}
                    </div>
                    
                    {/* Name */}
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-gray-300 capitalize group-hover:text-blue-300 transition-colors duration-200">
                        {item.name}
                      </span>
                    </div>

                  </motion.div>
                ))
              )}
            </div>

          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}