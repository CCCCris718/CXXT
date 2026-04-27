package redlib.backend.service.impl;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.Assert;
import org.springframework.web.multipart.MultipartFile;
import redlib.backend.config.NotebookAiProperties;
import redlib.backend.service.SpeechToTextService;
import redlib.backend.service.ai.NotebookAiProvider;
import redlib.backend.service.ai.NotebookAiProviderResolver;

@Service
public class SpeechToTextServiceImpl implements SpeechToTextService {
    @Autowired
    private NotebookAiProviderResolver providerResolver;

    @Autowired
    private NotebookAiProperties properties;

    @Override
    public String transcribe(MultipartFile file, String language) {
        Assert.notNull(file, "音频文件不能为空");
        Assert.isTrue(!file.isEmpty(), "音频文件不能为空");
        Assert.isTrue(file.getSize() <= properties.getMaxAudioSizeBytes(), "音频文件超过大小限制");
        NotebookAiProvider provider = providerResolver.resolve();
        return provider.transcribe(file, language, properties);
    }
}
