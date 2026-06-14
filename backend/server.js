import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

import { checkSimilarity } from './similarity.js';
import { combine } from './groqInference.js';
import { generateImage } from './fluxImageGen.js';

dotenv.config();

const app = express();
app.use(cors({
  origin: ["https://aethercraft.vercel.app", "http://localhost:5173"],
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));
app.use(express.json());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);


console.log("Connected to Supabase and Groq");

function capitalizeFirstLetter(string) {
  if (typeof string !== 'string' || string.length === 0) {
    return '';
  }
  return string.charAt(0).toUpperCase() + string.slice(1);
}
async function addToImages(imageBuffer, filename) {
    try {
        console.log("Uploading to Supabase Storage...");
        const path = `public/${filename}.png`;
        const { data, error } = await supabase
            .storage
            .from('icons')
            .upload(path, imageBuffer, {
                contentType: 'image/png',
                upsert: true
            });

        if (error) throw error;

        const { data: publicData } = supabase
            .storage
            .from('icons')
            .getPublicUrl(path);

        return publicData.publicUrl;
    } catch (err) {
        console.error("Storage Upload Error:", err.message);
        return null;
    }
}

async function addToInventory(userId, elementId) {
    if(!userId || !elementId) {
        throw new Error("Invalid userId or elementId");
    }
    const { data, error } = await supabase
        .from('inventory')
        .insert({ user_id: userId, element_id: elementId})
        .select()
    
    if (error) {
        console.error("Error adding to inventory:", error);
        throw error;
    }
    console.log("Added to inventory:", data);
}

async function addToRecipes(eid1, eid2, rid) {
    const { data, error } = await supabase
        .from('recipes')
        .insert({ id_a: eid1, id_b: eid2, id_result: rid})
        .select()
    
    if (error) {
        console.error("Error adding to recipes:", error);
        throw error;
    }
    console.log("Added to recipes:", data);
}

async function addToElements(ename, embedding, userId, imageUrl) {
    if(!ename || !embedding) {
        throw new Error("Invalid element name or missing embedding vector");
    }
    const { data, error } = await supabase
        .from('elements')
        .insert({
            name: capitalizeFirstLetter(ename.toLowerCase()),
            embedding: embedding,
            discovered_by: userId,
            image_url: imageUrl
        })
        .select()
        .single(); 

    if (error) {
        console.error("Error adding to elements:", error);
        throw error;
    }
    
    return data; 
}

async function recipeExists(eid1, eid2) {
    const { data, error } = await supabase
        .from('recipes')
        .select('*')
        .eq('id_a', eid1)
        .eq('id_b', eid2);
    
    if (data && data.length > 0) {
        console.log("Recipe exists:", eid1, "and", eid2);
        return true;
    }
    else return false;
}

async function existsInInventory(userId, elementId) {
    const { data, error } = await supabase
        .from('inventory')
        .select('*')
        .eq('user_id', userId)
        .eq('element_id', elementId);
    
    if (data && data.length > 0) {
        console.log("Element exists in inventory:", elementId, "for user :", userId);
        return true;
    }
    else return false;
}



app.post('/api/combine', async (req, res) => {
    let { userId, element1Id, element2Id } = req.body;
    if(!userId || !element1Id || !element2Id) {
        return res.status(400).json({ error: 'Invalid request body' });
    }

    try {
        const exists1 = await existsInInventory(userId, element1Id);
        const exists2 = await existsInInventory(userId, element2Id);
        console.log(exists1, exists2);
        if (!exists1 || !exists2) {
            return res.status(400).json({ error: 'One or both elements not in inventory' });
        }

        if(element1Id > element2Id){
            const temp = element1Id;
            element1Id = element2Id;
            element2Id = temp;
        }

        const { data: data1, error: error1 } = await supabase
            .from('elements')
            .select('name')
            .eq('id', element1Id)
            .single(); 
        if (error1 || !data1) return res.status(400).json({ error: "Element 1 not found" });
        const element1 = data1.name;
        const { data: data2, error: error2 } = await supabase
            .from('elements')
            .select('name')
            .eq('id', element2Id)
            .single();
        if (error2 || !data2) return res.status(400).json({ error: "Element 2 not found" });
        const element2 = data2.name;


        if(await recipeExists(element1Id, element2Id)){                                             // not a new recipe
            console.log("This is not a new element, already exists")
            const { data, error } = await supabase
                .from('recipes')
                .select('id_result')
                .eq('id_a', element1Id)
                .eq('id_b', element2Id);
            

            const resultId = data[0].id_result;
            if(!resultId){                                                                      // already tried before, cannot be combined
                console.log("elements cannot be combined")
                return res.status(200).json({ message: 'Elements cannot be combined' });
            }

            // 🟢 ADDED: Fetch details for existing element so frontend isn't blind
            const { data: existingData } = await supabase
                .from('elements')
                .select('name, image_url, discovered_by')
                .eq('id', resultId)
                .single();

            let discoverer = "God";
            if (existingData && existingData.discovered_by) {
                const { data: p } = await supabase
                    .from('profiles')
                    .select('username')
                    .eq('id', existingData.discovered_by)
                    .single();
                if (p) discoverer = p.username;
            }

            if(await existsInInventory(userId, resultId)){                                      // already unlocked
                console.log("Element already in inventory");
                // 🟢 UPDATED RETURN
                return res.status(200).json({ 
                    message: 'Element already in inventory', 
                    elementId: resultId,
                    elementName: existingData.name,
                    imageUrl: existingData.image_url,
                    discoveredBy: discoverer
                });
            }
            else{                                                                               // unlocked now
                await addToInventory(userId, resultId);
                console.log(`User ${userId} combined elements ${element1Id} and ${element2Id} to unlock element ${resultId}`);
                // 🟢 UPDATED RETURN
                return res.status(200).json({ 
                    message: 'Element added to inventory', 
                    elementId: resultId,
                    elementName: existingData.name,
                    imageUrl: existingData.image_url,
                    discoveredBy: discoverer
                });
            }
        }  
        else{                                                                                // new recipe
            console.log("Recipe doesn't exist");
            let aiResult; 

            try {
                // Try to get a result from AI
                aiResult = await combine(element1, element2);
            } catch (err) {
                // 🛑 CASE A: AI CRASHED
                console.error("💥 AI Generation Failed. Aborting save.");
                return res.status(500).json({ error: "AI Service Unavailable" });
            }
       
            // 🛑 CASE B: AI SAID "IMPOSSIBLE" (Returned null successfully)
            if (!aiResult) {
                console.log("elements cannot be combined")
                await addToRecipes(element1Id, element2Id, null);
                return res.status(200).json({ message: 'Elements cannot be combined' });
            }
            else{
                const ename = aiResult.name.toLowerCase();
                
                const {isDuplicate, existingId, vector} = await checkSimilarity(supabase, ename);
                
                if (!vector && !isDuplicate) {
                    console.log("Vector generation failed, cannot save.");
                    return res.status(500).json({ error: 'Vector generation failed' });
                }

                if (isDuplicate) {
                    // Case: The element exists in the GLOBAL database (e.g., ID 24)
                    console.log(`♻️ Element ${existingId} already exists in DB. Linking...`);
                    
                    // 1. Fetch details so we can return them
                    const { data: duplicateData } = await supabase
                        .from('elements')
                        .select('name, image_url, discovered_by')
                        .eq('id', existingId)
                        .single();

                    let discoverer = "God";
                    if (duplicateData && duplicateData.discovered_by) {
                        const { data: p } = await supabase
                            .from('profiles')
                            .select('username')
                            .eq('id', duplicateData.discovered_by)
                            .single();
                        if (p) discoverer = p.username;
                    }

                    // 2. Always save the recipe (So 16 + 19 = 24 is remembered)
                    await addToRecipes(element1Id, element2Id, existingId);

                    // 3. 🛑 SAFETY CHECK: Only add to inventory if they don't have it yet!
                    const alreadyHasIt = await existsInInventory(userId, existingId);
                    
                    if (!alreadyHasIt) {
                        await addToInventory(userId, existingId);
                        console.log(`User ${userId} unlocked existing element ${existingId}`);
                        
                        return res.status(200).json({ 
                            message: 'Element added to inventory', 
                            elementId: existingId,
                            elementName: duplicateData.name,
                            imageUrl: duplicateData.image_url,
                            discoveredBy: discoverer
                        });
                    } else {
                        console.log(`User ${userId} already has element ${existingId}`);
                        
                        // Return success (Recipe Unlocked) but don't crash
                        return res.status(200).json({ 
                            message: 'Recipe discovered (Element already owned)', 
                            elementId: existingId,
                            elementName: duplicateData.name,
                            imageUrl: duplicateData.image_url,
                            discoveredBy: discoverer
                        });
                    }
                }
                else {
                    console.log("New unique element!");
                    
                    let permanentUrl = null;
                    
                    try {
                        const tempFalUrl = await generateImage(ename);
                        if(tempFalUrl) {
                             const filename = `${ename.replace(/\s+/g, '_')}_${Date.now()}`;
                             permanentUrl = await addToImages(tempFalUrl, filename);
                             console.log("Image saved at: " + permanentUrl);
                        }
                    } catch (e) {
                        console.error("Image generation failed", e);
                    }

                    const newElement = await addToElements(ename, vector, userId, permanentUrl);
                    const new_result_id = newElement.id;

                    console.log(`✨ ID Captured: ${new_result_id}`);

                    await addToRecipes(element1Id, element2Id, new_result_id);
                    await addToInventory(userId, new_result_id);
                    
                    console.log(`User ${userId} combined elements ${element1Id} and ${element2Id} to discover new element ${new_result_id}`);

                    // Fetch discoverer profile
                    const { data: p } = await supabase
                        .from('profiles')
                        .select('username')
                        .eq('id', userId)
                        .single();
                    const discoverer = p ? p.username : "Unknown";
                    
                    // 🟢 UPDATED RETURN
                    return res.status(200).json({ 
                        message: 'New element created and added to inventory', 
                        elementId: new_result_id,
                        elementName: newElement.name, // 👈 Send back the name
                        imageUrl: permanentUrl,        // 👈 Send back the URL
                        discoveredBy: discoverer
                    });
                }
            }

        }
    }
    catch (error) {
        console.error('Error combining elements:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 📦 GET INVENTORY (Updated with Auto-Gift Logic)
app.get('/api/inventory/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    // 1. Fetch their current inventory
    let { data: inventory, error } = await supabase
      .from('inventory')
      .select('element_id, elements(*)')
      .eq('user_id', userId);

    if (error) throw error;

    // 2. 🎁 CHECK: Is it empty? If so, give them the Starter Pack!
    if (!inventory || inventory.length === 0) {
      console.log(`New user detected (${userId}). Gifting starter pack...`);

      // Find the IDs for Fire, Water, Earth, Air
      const { data: baseElements } = await supabase
        .from('elements')
        .select('id')
        .in('name', ['Fire', 'Water', 'Earth', 'Air']);

      if (baseElements && baseElements.length > 0) {
        // Prepare the items
        const newItems = baseElements.map(el => ({
          user_id: userId,
          element_id: el.id
        }));

        // Insert them into the inventory
        const { error: insertError } = await supabase
            .from('inventory')
            .insert(newItems);
        
        if (!insertError) {
             // 3. Re-fetch the inventory so they see items immediately
            const { data: refreshedInventory } = await supabase
            .from('inventory')
            .select('element_id, elements(*)')
            .eq('user_id', userId);
            
            inventory = refreshedInventory;
        }
      }
    }

    // Fetch discoverer usernames
    const discovererIds = [...new Set(inventory.map(item => item.elements?.discovered_by).filter(Boolean))];
    let usernameMap = {};
    if (discovererIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username')
        .in('id', discovererIds);
      if (profiles) {
        profiles.forEach(p => {
          usernameMap[p.id] = p.username;
        });
      }
    }

    // 3. Send the data to the frontend
    const formattedInventory = inventory.map(item => {
      const element = item.elements;
      let discoverer = "God";
      if (element && element.discovered_by) {
        discoverer = usernameMap[element.discovered_by] || "Unknown";
      }
      return {
        id: element?.id,
        name: element?.name,
        image: element?.image_url,
        discoveredBy: discoverer
      };
    });

    res.json(formattedInventory);

  } catch (error) {
    console.error('Inventory error:', error);
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

// 🏆 GET LEADERBOARD
// 🏆 GET LEADERBOARD (Updated to use SQL View)
app.get('/api/leaderboard', async (req, res) => {
  try {
    // Query the pre-calculated view we just created
    const { data, error } = await supabase
      .from('leaderboard_view')
      .select('*')
      .limit(10); // Get top 10

    if (error) throw error;

    res.json(data);

  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// Export the app for Vercel
export default app;

// Only start the server if we are running locally (not on Vercel)
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Server running locally on port ${PORT}`);
  });
}