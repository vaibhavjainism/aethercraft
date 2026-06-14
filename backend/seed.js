import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { generateImage } from './fluxImageGen.js';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const HF_API_KEY = process.env.HF_API_KEY;

async function getEmbedding(text) {
  try {
    console.log(`Generating embedding for base element: "${text}"`);
    const response = await fetch(
      `https://router.huggingface.co/hf-inference/models/sentence-transformers/all-MiniLM-L6-v2/pipeline/feature-extraction`, 
      {
        headers: { 
            Authorization: `Bearer ${HF_API_KEY}`,
            "Content-Type": "application/json"
        },
        method: "POST",
        body: JSON.stringify({ inputs: text }),
      }
    );

    if (!response.ok) {
        throw new Error(`HF API Error: ${response.statusText}`);
    }

    const result = await response.json();
    let vector = result;
    if (Array.isArray(result) && Array.isArray(result[0])) {
        vector = result[0];
    }
    return vector;
  } catch (error) {
    console.error(`Failed to get embedding for "${text}":`, error.message);
    return null;
  }
}

async function uploadBufferToStorage(buffer, filename) {
  try {
    const storagePath = `public/${filename}`;
    console.log(`Uploading ${filename} to Supabase storage...`);
    const { data, error } = await supabase.storage
      .from('icons')
      .upload(storagePath, buffer, {
        contentType: 'image/png',
        upsert: true
      });

    if (error) throw error;

    const { data: publicData } = supabase.storage
      .from('icons')
      .getPublicUrl(storagePath);

    return publicData.publicUrl;
  } catch (err) {
    console.error(`Storage Upload Error for ${filename}:`, err.message);
    return null;
  }
}

async function seed() {
  const baseElements = ['Fire', 'Water', 'Earth', 'Air'];

  for (const name of baseElements) {
    // 1. Generate image dynamically using Hugging Face inference (FLUX.1-schnell)
    console.log(`Generating visual icon for ${name}...`);
    const imageBuffer = await generateImage(name);
    if (!imageBuffer) {
      console.log(`Skipping image upload for ${name} due to generation failure.`);
      continue;
    }

    // 2. Upload the generated image to Supabase
    const filename = `${name.toLowerCase()}_${Date.now()}.png`;
    const publicUrl = await uploadBufferToStorage(imageBuffer, filename);
    if (!publicUrl) {
      console.log(`Skipping database entry for ${name} due to storage upload failure.`);
      continue;
    }

    // 3. Generate vector embedding
    let embedding = await getEmbedding(name);
    if (!embedding) {
      console.log(`⚠️ Failed to generate embedding for ${name}. Falling back to zero-vector.`);
      embedding = new Array(384).fill(0);
    }

    // 4. Upsert into database elements table
    console.log(`Upserting ${name} database record...`);
    const { data, error } = await supabase
      .from('elements')
      .upsert({
        name: name,
        embedding: embedding,
        image_url: publicUrl,
        discovered_by: null
      }, { onConflict: 'name' })
      .select();

    if (error) {
      console.error(`Error saving ${name} to DB:`, error.message);
    } else {
      console.log(`Successfully seeded ${name}!`);
    }
  }
  console.log("Seeding complete!");
}

seed();
