// Тестируем API для проверки реальных доменов
const testDomains = ['google.com', 'youtube.com', 'github.com'];

async function testDomain(domain) {
  console.log(`\n🔍 Тестируем: ${domain}`);
  console.log('━'.repeat(50));
  
  try {
    const response = await fetch('http://localhost:3000/api/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain })
    });
    
    const data = await response.json();
    
    if (data.error) {
      console.log('❌ Ошибка:', data.error);
      return;
    }
    
    console.log(`✅ Найдено поддоменов: ${data.total}`);
    console.log('\nАктивные поддомены (первые 10):');
    
    const activeSubdomains = data.subdomains.filter(s => s.ips.length > 0).slice(0, 10);
    
    activeSubdomains.forEach((sub, i) => {
      console.log(`  ${i + 1}. ${sub.subdomain}`);
      console.log(`     IP: ${sub.ips.join(', ')}`);
      console.log(`     Источник: ${sub.source}`);
    });
    
    const sources = {};
    data.subdomains.forEach(sub => {
      sources[sub.source] = (sources[sub.source] || 0) + 1;
    });
    
    console.log('\nСтатистика по источникам:');
    Object.entries(sources).forEach(([source, count]) => {
      console.log(`  ${source}: ${count}`);
    });
    
  } catch (error) {
    console.log('❌ Ошибка запроса:', error.message);
  }
}

async function runTests() {
  console.log('🚀 Начинаем тестирование поиска доменов...\n');
  
  for (const domain of testDomains) {
    await testDomain(domain);
    await new Promise(resolve => setTimeout(resolve, 2000)); // Пауза между запросами
  }
  
  console.log('\n✅ Тестирование завершено!');
}

runTests();
