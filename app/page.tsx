'use client';
import { useState } from 'react';

interface SubdomainInfo {
  subdomain: string;
  ips: string[];
  source: string;
}

interface DomainInfo {
  domain: string;
  subdomains: SubdomainInfo[];
  total: number;
  error?: string;
}

interface ReverseDNSResult {
  ip: string;
  hostnames: string[];
  error?: string;
}

interface ReverseDNSResponse {
  results: ReverseDNSResult[];
  total: number;
  successful: number;
}

type Tab = 'forward' | 'reverse';

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>('forward');
  const [domain, setDomain] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DomainInfo | null>(null);
  
  // Состояния для reverse DNS
  const [reverseText, setReverseText] = useState('');
  const [reverseLoading, setReverseLoading] = useState(false);
  const [reverseResult, setReverseResult] = useState<ReverseDNSResponse | null>(null);

  const checkDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!domain) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain }),
      });
      const data = await res.json();
      setResult(data);
    } catch (error) {
      setResult({ domain, subdomains: [], total: 0, error: 'Ошибка подключения' });
    } finally {
      setLoading(false);
    }
  };

  const checkReverseDNS = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reverseText) return;
    setReverseLoading(true);
    setReverseResult(null);
    try {
      const res = await fetch('/api/reverse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: reverseText }),
      });
      const data = await res.json();
      setReverseResult(data);
    } catch (error) {
      console.error('Ошибка:', error);
    } finally {
      setReverseLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setReverseText(text);
    };
    reader.readAsText(file);
  };

  const exportToTxt = () => {
    if (!result || result.subdomains.length === 0) return;
    
    // Создаем содержимое файла
    const content = result.subdomains
      .map(sub => sub.subdomain)
      .join('\n');
    
    // Создаем blob и ссылку для скачивания
    const blob = new Blob([content], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${result.domain}_subdomains.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const exportIPsToTxt = () => {
    if (!result || result.subdomains.length === 0) return;
    
    const allIps = new Set<string>();
    result.subdomains.forEach(sub => {
      sub.ips.forEach(ip => allIps.add(ip));
    });
    
    if (allIps.size === 0) return;
    
    const content = Array.from(allIps).sort().join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${result.domain}_ips.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const exportReverseDNSToTxt = () => {
    if (!reverseResult || reverseResult.results.length === 0) return;
    
    // Создаем содержимое файла - только доменные имена
    const domains = new Set<string>();
    reverseResult.results.forEach(r => {
      r.hostnames.forEach(hostname => domains.add(hostname));
    });
    
    const content = Array.from(domains).sort().join('\n');
    
    // Создаем blob и ссылку для скачивания
    const blob = new Blob([content], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reverse_dns_results.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const exportReverseIPsToTxt = () => {
    if (!reverseResult || reverseResult.results.length === 0) return;
    
    const ips = reverseResult.results
      .filter(r => r.hostnames.length > 0)
      .map(r => r.ip)
      .sort();
    
    if (ips.length === 0) return;
    
    const content = ips.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reverse_dns_ips.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold text-gray-800 mb-2 text-center">DNS Инструменты</h1>
        <p className="text-gray-600 text-center mb-8">Работа с доменными именами и IP адресами</p>
        
        {/* Вкладки */}
        <div className="mb-8 flex gap-4 border-b border-gray-300">
          <button
            onClick={() => setActiveTab('forward')}
            className={`px-6 py-3 font-semibold transition border-b-2 ${
              activeTab === 'forward'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-600 hover:text-gray-800'
            }`}
          >
            Поиск поддоменов
          </button>
          <button
            onClick={() => setActiveTab('reverse')}
            className={`px-6 py-3 font-semibold transition border-b-2 ${
              activeTab === 'reverse'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-600 hover:text-gray-800'
            }`}
          >
            Reverse DNS (IP → Домен)
          </button>
        </div>

        {/* Вкладка: Поиск поддоменов */}
        {activeTab === 'forward' && (
          <>
            <form onSubmit={checkDomain} className="mb-8">
              <div className="flex gap-4">
                <input
                  type="text"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="Введите домен (например, example.com)"
                  className="flex-1 px-6 py-4 rounded-lg border-2 border-gray-300 focus:border-indigo-500 focus:outline-none text-lg"
                />
                <button
                  type="submit"
                  disabled={loading || !domain}
                  className="px-8 py-4 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:bg-gray-400 transition"
                >
                  {loading ? 'Поиск...' : 'Найти'}
                </button>
              </div>
            </form>

            {result && (
              <div className="bg-white rounded-xl shadow-lg p-8">
                <div className="mb-6 flex items-start justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-800 mb-2">
                      Домен: <span className="text-indigo-600">{result.domain}</span>
                    </h2>
                    <p className="text-lg text-gray-600">
                      Найдено поддоменов: <span className="font-bold text-indigo-600">{result.total}</span>
                    </p>
                  </div>
                  {!result.error && result.subdomains.length > 0 && (
                    <div className="flex gap-3">
                      <button
                        onClick={exportToTxt}
                        className="px-6 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition flex items-center gap-2"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Домены TXT
                      </button>
                      <button
                        onClick={exportIPsToTxt}
                        className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition flex items-center gap-2"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        IP адреса TXT
                      </button>
                    </div>
                  )}
                </div>

                {result.error ? (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
                    {result.error}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {result.subdomains.map((sub, idx) => (
                      <div
                        key={idx}
                        className="border border-gray-200 rounded-lg p-4 hover:border-indigo-300 transition"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <h3 className="font-mono text-lg font-semibold text-gray-800">
                              {sub.subdomain}
                            </h3>
                            <div className="flex gap-2 items-center mt-1">
                              <span className="text-xs px-2 py-1 bg-indigo-100 text-indigo-700 rounded">
                                {sub.source}
                              </span>
                              {sub.ips.length > 0 && (
                                <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded">
                                  Активен
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        {sub.ips.length > 0 && (
                          <div className="mt-2">
                            <p className="text-sm text-gray-600 mb-1">IP адреса:</p>
                            <div className="flex flex-wrap gap-2">
                              {sub.ips.map((ip, i) => (
                                <span
                                  key={i}
                                  className="font-mono text-sm bg-gray-50 px-3 py-1 rounded border border-gray-200"
                                >
                                  {ip}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}

                    {result.subdomains.length === 0 && (
                      <div className="text-center py-8 text-gray-500">
                        Поддомены не найдены
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Вкладка: Reverse DNS */}
        {activeTab === 'reverse' && (
          <>
            <form onSubmit={checkReverseDNS} className="mb-8">
              <div className="bg-white rounded-xl shadow-lg p-6 mb-4">
                <label className="block mb-4">
                  <span className="text-gray-700 font-semibold mb-2 block">
                    Загрузите файл или вставьте текст с IP адресами
                  </span>
                  <input
                    type="file"
                    accept=".txt,.bat,.sh"
                    onChange={handleFileUpload}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                  />
                </label>
                <textarea
                  value={reverseText}
                  onChange={(e) => setReverseText(e.target.value)}
                  placeholder="Или вставьте текст с IP адресами или командами route add..."
                  className="w-full h-48 px-4 py-3 rounded-lg border-2 border-gray-300 focus:border-indigo-500 focus:outline-none font-mono text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={reverseLoading || !reverseText}
                className="w-full px-8 py-4 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:bg-gray-400 transition"
              >
                {reverseLoading ? 'Обработка...' : 'Преобразовать IP в доменные имена'}
              </button>
            </form>

            {reverseResult && (
              <div className="bg-white rounded-xl shadow-lg p-8">
                <div className="mb-6 flex items-start justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-800 mb-2">
                      Результаты Reverse DNS
                    </h2>
                    <p className="text-lg text-gray-600">
                      Обработано IP: <span className="font-bold text-indigo-600">{reverseResult.total}</span>
                      {' | '}
                      Найдено доменов: <span className="font-bold text-green-600">{reverseResult.successful}</span>
                    </p>
                  </div>
                  {reverseResult.successful > 0 && (
                    <div className="flex gap-3">
                      <button
                        onClick={exportReverseDNSToTxt}
                        className="px-6 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition flex items-center gap-2"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Домены TXT
                      </button>
                      <button
                        onClick={exportReverseIPsToTxt}
                        className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition flex items-center gap-2"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        IP адреса TXT
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  {reverseResult.results.map((item, idx) => (
                    <div
                      key={idx}
                      className={`border rounded-lg p-4 transition ${
                        item.hostnames.length > 0
                          ? 'border-green-200 bg-green-50'
                          : 'border-gray-200 bg-gray-50'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-mono text-lg font-semibold text-gray-800">
                            {item.ip}
                          </h3>
                          {item.hostnames.length > 0 ? (
                            <div className="mt-2">
                              <p className="text-sm text-gray-600 mb-1">Доменные имена:</p>
                              <div className="space-y-1">
                                {item.hostnames.map((hostname, i) => (
                                  <div
                                    key={i}
                                    className="font-mono text-sm bg-white px-3 py-2 rounded border border-green-200"
                                  >
                                    {hostname}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <p className="text-sm text-gray-500 mt-1">
                              {item.error || 'Доменное имя не найдено'}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}

                  {reverseResult.results.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      Нет результатов
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
