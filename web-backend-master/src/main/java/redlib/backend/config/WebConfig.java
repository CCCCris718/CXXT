package redlib.backend.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.SchedulingConfigurer;
import org.springframework.scheduling.config.ScheduledTaskRegistrar;
import org.springframework.web.servlet.config.annotation.ViewControllerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.concurrent.Executors;

/**
 * @author 李洪文
 * @description
 * @date 2019/12/12 9:32
 */
@Configuration
public class WebConfig implements WebMvcConfigurer, SchedulingConfigurer {
    @Override
    public void addViewControllers(ViewControllerRegistry registry) {
        registerReactRoute(registry, "");
    }

    private void registerReactRoute(ViewControllerRegistry registry, String directoryName) {
        String regex = "/**/{spring:\\w+}";
        String forwardUrl = "forward:/" + directoryName + "index.html";

        registry.addViewController("/" + directoryName + "/")
                .setViewName(forwardUrl);

        registry.addViewController("/" + directoryName + regex)
                .setViewName(forwardUrl);
    }

    @Override
    public void configureTasks(ScheduledTaskRegistrar scheduledTaskRegistrar) {
        scheduledTaskRegistrar.setScheduler(Executors.newScheduledThreadPool(10));
    }
}
