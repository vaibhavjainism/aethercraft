import 'dotenv/config';

const HF_API_KEY = process.env.HF_API_KEY;

export async function generateImage(element) {
    const prompt = `A 3D clay stylized icon of ${element}. Minimalist, cute, smooth claymation style, soft colors, layered simple geometric shape, gentle studio lighting, isolated on a plain solid white background. Vector emoji style.`;
    console.log(`Generating image for: ${element}`);
    try {
        const response = await fetch(
            "https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell",
            {
                headers: { 
                    Authorization: `Bearer ${HF_API_KEY}`,
                    "Content-Type": "application/json"
                },
                method: "POST",
                body: JSON.stringify({ inputs: prompt }),
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HF Error: ${response.statusText} - ${errorText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        console.log("Image generated successfully via Hugging Face");
        return Buffer.from(arrayBuffer);
    } catch (error) {
        console.error("HF Inference Error:", error.message);
        return null;
    }
}
