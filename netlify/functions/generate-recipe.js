// Netlify Function para generar recetas con Groq AI (GRATIS)
// Ubicación: netlify/functions/generate-recipe.js

exports.handler = async (event, context) => {
  // Solo aceptar POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Obtener ingredientes del body
    const { ingredients } = JSON.parse(event.body);

    if (!ingredients || ingredients.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'No se enviaron ingredientes' })
      };
    }

    // API key desde variables de entorno de Netlify
    const GROQ_API_KEY = process.env.GROQ_API_KEY;

    if (!GROQ_API_KEY) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'API key de Groq no configurada en Netlify' })
      };
    }

    // Llamar a la API de Groq
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b', // Modelo gratuito y potente
        messages: [{
          role: 'user',
          content: `Crea UNA SOLA receta deliciosa usando SOLO estos ingredientes disponibles: ${ingredients}. 

IMPORTANTE: 
- Usa SOLO ingredientes de la lista
- Si faltan ingredientes básicos (sal, aceite, agua), puedes mencionarlos
- Responde SOLO en formato JSON válido, sin markdown, sin comentarios
- No agregues texto antes ni después del JSON

Formato JSON requerido:
{
  "nombre": "Nombre de la receta",
  "descripcion": "Breve descripción atractiva",
  "ingredientes": [
    {"nombre": "ingrediente", "cantidad": "100g", "disponible": true}
  ],
  "pasos": [
    "Paso 1...",
    "Paso 2..."
  ],
  "tiempo": "30 minutos",
  "porciones": "4 porciones"
}`
        }],
        temperature: 0.7,
        max_tokens: 1500
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Error de Groq:', errorData);
      return {
        statusCode: response.status,
        body: JSON.stringify({ 
          error: `Error de Groq: ${errorData.error?.message || 'Error desconocido'}` 
        })
      };
    }

    const data = await response.json();
    const recipeText = data.choices[0].message.content;

    // Limpiar el texto de markdown y otros extras
    let cleanedText = recipeText.trim();
    cleanedText = cleanedText.replace(/```json\s*/g, '');
    cleanedText = cleanedText.replace(/```\s*/g, '');

    // Buscar el JSON (entre { y })
    const jsonStart = cleanedText.indexOf('{');
    const jsonEnd = cleanedText.lastIndexOf('}') + 1;

    if (jsonStart === -1 || jsonEnd === 0) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'No se encontró JSON válido en la respuesta' })
      };
    }

    cleanedText = cleanedText.substring(jsonStart, jsonEnd);

    // Validar que sea JSON válido
    const recipe = JSON.parse(cleanedText);

    // Devolver la receta
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*' // Permitir CORS
      },
      body: JSON.stringify({ recipe })
    };

  } catch (error) {
    console.error('Error en la función:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Error interno del servidor',
        details: error.message 
      })
    };
  }
};