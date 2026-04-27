package redlib.backend.service.ai;

import com.alibaba.fastjson2.JSONArray;
import com.alibaba.fastjson2.JSONObject;
import org.springframework.stereotype.Component;
import org.springframework.util.Assert;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;
import redlib.backend.config.NotebookAiProperties;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

@Component
public class DeepSeekAiProvider implements NotebookAiProvider {
    private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(60);
    private final HttpClient httpClient = HttpClient.newHttpClient();

    @Override
    public String getProviderName() {
        return "deepseek";
    }

    @Override
    public String translate(String text, String sourceLanguage, String targetLanguage, NotebookAiProperties properties) {
        Assert.hasText(text, "翻译文本不能为空");
        Assert.hasText(targetLanguage, "目标语言不能为空");
        String model = requireModel(properties.getTranslationModel(), "translation");
        String normalizedSource = StringUtils.hasText(sourceLanguage) ? sourceLanguage : "auto";
        String prompt = "你是一个专业翻译助手。请将文本从" + normalizedSource + "翻译为" + targetLanguage
                + "。只输出翻译结果，不要添加额外解释。\n\n文本：\n" + text;
        return callChatCompletion(prompt, model, properties);
    }

    @Override
    public String summarize(String text, Integer maxLength, NotebookAiProperties properties) {
        Assert.hasText(text, "摘要文本不能为空");
        String model = requireModel(properties.getSummaryModel(), "summary");
        int summaryLength = maxLength == null || maxLength <= 0 ? 160 : maxLength;
        String prompt = "请对以下文本进行摘要。摘要长度不超过" + summaryLength
                + "个中文字符。只输出摘要结果，不要添加前缀。\n\n文本：\n" + text;
        return callChatCompletion(prompt, model, properties);
    }

    @Override
    public String transcribe(MultipartFile file, String language, NotebookAiProperties properties) {
        throw new IllegalStateException("DeepSeek provider 暂不支持音频转写，请切换到支持转写的provider");
    }

    private String callChatCompletion(String prompt, String model, NotebookAiProperties properties) {
        Assert.hasText(properties.getBaseUrl(), "AI baseUrl未配置");
        Assert.hasText(properties.getApiKey(), "AI apiKey未配置");
        String endpoint = normalizeBaseUrl(properties.getBaseUrl()) + "/chat/completions";

        JSONObject body = new JSONObject();
        body.put("model", model);
        JSONArray messages = new JSONArray();
        JSONObject systemMessage = new JSONObject();
        systemMessage.put("role", "system");
        systemMessage.put("content", "你是一个严谨、简洁的笔记AI助手。");
        messages.add(systemMessage);
        JSONObject userMessage = new JSONObject();
        userMessage.put("role", "user");
        userMessage.put("content", prompt);
        messages.add(userMessage);
        body.put("messages", messages);
        body.put("temperature", 0.2);

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(endpoint))
                .timeout(REQUEST_TIMEOUT)
                .header("Authorization", "Bearer " + properties.getApiKey())
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body.toJSONString(), StandardCharsets.UTF_8))
                .build();
        try {
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            Assert.isTrue(response.statusCode() >= 200 && response.statusCode() < 300, "AI调用失败，HTTP状态码: " + response.statusCode());
            JSONObject responseJson = JSONObject.parseObject(response.body());
            JSONArray choices = responseJson.getJSONArray("choices");
            Assert.isTrue(choices != null && !choices.isEmpty(), "AI返回内容为空");
            JSONObject firstChoice = choices.getJSONObject(0);
            JSONObject message = firstChoice.getJSONObject("message");
            Assert.notNull(message, "AI返回message为空");
            String content = message.getString("content");
            Assert.hasText(content, "AI返回文本为空");
            return content.trim();
        } catch (IOException e) {
            throw new IllegalStateException("AI调用失败，请检查网络连接", e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("AI调用被中断", e);
        }
    }

    private String normalizeBaseUrl(String baseUrl) {
        String normalized = baseUrl.trim();
        if (normalized.endsWith("/")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        if (!normalized.endsWith("/v1")) {
            normalized = normalized + "/v1";
        }
        return normalized;
    }

    private String requireModel(String model, String scene) {
        Assert.hasText(model, "AI " + scene + " model未配置");
        return model.trim();
    }
}
