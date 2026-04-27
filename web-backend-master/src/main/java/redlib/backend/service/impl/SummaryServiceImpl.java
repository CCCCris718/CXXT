package redlib.backend.service.impl;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import redlib.backend.config.NotebookAiProperties;
import redlib.backend.service.SummaryService;
import redlib.backend.service.ai.NotebookAiProvider;
import redlib.backend.service.ai.NotebookAiProviderResolver;

@Service
public class SummaryServiceImpl implements SummaryService {
    @Autowired
    private NotebookAiProviderResolver providerResolver;

    @Autowired
    private NotebookAiProperties properties;

    @Override
    public String summarize(String text, Integer maxLength) {
        NotebookAiProvider provider = providerResolver.resolve();
        return provider.summarize(text, maxLength, properties);
    }
}
