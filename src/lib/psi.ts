import axios from 'axios';

export async function getPageSpeedInsights(url: string) {
  const apiKey = process.env.PAGESPEED_API_KEY;
  if (!apiKey) {
    console.warn('PAGESPEED_API_KEY not found. Returning mock data.');
    return {
      performance: 85,
      accessibility: 90,
      bestPractices: 88,
      seo: 92,
    };
  }

  try {
    const response = await axios.get(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed`, {
      params: {
        url,
        key: apiKey,
        category: ['performance', 'accessibility', 'best-practices', 'seo'],
      },
    });

    const categories = response.data.lighthouseResult.categories;
    return {
      performance: Math.round(categories.performance.score * 100),
      accessibility: Math.round(categories.accessibility.score * 100),
      bestPractices: Math.round(categories['best-practices'].score * 100),
      seo: Math.round(categories.seo.score * 100),
    };
  } catch (error) {
    console.error('Error fetching PSI data:', error);
    return null;
  }
}
