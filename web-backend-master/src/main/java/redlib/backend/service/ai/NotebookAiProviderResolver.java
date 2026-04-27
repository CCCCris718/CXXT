package redlib.backend.service.ai;

import org.springframework.stereotype.Component;
import org.springframework.util.Assert;
import org.springframework.util.StringUtils;
import redlib.backend.config.NotebookAiProperties;

import java.util.List;

@Component
public class NotebookAiProviderResolver {
    private final List<NotebookAiProvider> providers;
    private final NotebookAiProperties properties;

    public NotebookAiProviderResolver(List<NotebookAiProvider> providers, NotebookAiProperties properties) {
        this.providers = providers;
        this.properties = properties;
    }

    public NotebookAiProvider resolve() {
        Assert.isTrue(properties.isEnabled(), "AI功能未启用");
        Assert.hasText(properties.getProvider(), "AI provider未配置");
        for (NotebookAiProvider provider : providers) {
            if (StringUtils.pathEquals(provider.getProviderName(), properties.getProvider())) {
                return provider;
            }
        }
        throw new IllegalStateException("未找到匹配的AI provider: " + properties.getProvider());
    }
}
