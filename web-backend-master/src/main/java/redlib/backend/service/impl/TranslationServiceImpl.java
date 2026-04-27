package redlib.backend.service.impl;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import redlib.backend.config.NotebookAiProperties;
import redlib.backend.service.TranslationService;
import redlib.backend.service.ai.NotebookAiProvider;
import redlib.backend.service.ai.NotebookAiProviderResolver;

@Service
public class TranslationServiceImpl implements TranslationService {
    @Autowired
    private NotebookAiProviderResolver providerResolver;

    @Autowired
    private NotebookAiProperties properties;

    @Override
    public String translate(String text, String sourceLanguage, String targetLanguage) {
        NotebookAiProvider provider = providerResolver.resolve();
        return provider.translate(text, sourceLanguage, targetLanguage, properties);
    }
}
